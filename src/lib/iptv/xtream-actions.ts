import "server-only";

import type { VerifiedIptvCredential } from "@/lib/iptv/iptv-credential-auth";
import {
  getAggregatedXtreamCatalog,
  type AggregatedStreamRow,
} from "@/lib/iptv/aggregated-channels";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { prisma } from "@/lib/db/prisma";

/** Xtream-compatible live stream JSON (subset of fields commonly used by IPTV players). */
export function xtreamLiveStreamJson(
  row: AggregatedStreamRow,
  num: number,
): Record<string, string | number> {
  const { channel, streamId, categoryId } = row;
  return {
    num,
    name: channel.name,
    stream_type: "live",
    stream_id: streamId,
    stream_icon: channel.tvgLogo ?? "",
    epg_channel_id: channel.tvgId ?? "",
    added: "0",
    category_id: categoryId,
    custom_sid: "",
    tv_archive_duration: 0,
    direct_source: "",
    tv_archive_server_id: "",
    tv_archive_dns: "",
  };
}

export function xtreamAuthenticatedPayload(
  request: Request,
  cred: VerifiedIptvCredential,
  portalPasswordEcho: string,
): Record<string, unknown> {
  const origin = getRequestOrigin(request);
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    user_info: {
      username: cred.portalUsername,
      password: portalPasswordEcho,
      message: "",
      auth: 1,
      status: "Active",
      exp_date: String(nowSec + 86400 * 365 * 20),
      is_trial: "0",
      active_cons: "0",
      created_at: String(nowSec),
      max_connections: "5",
      allowed_output_formats: ["m3u8", "ts"],
    },
    server_info: {
      url: origin,
      port: new URL(origin).port || (new URL(origin).protocol === "https:" ? "443" : "80"),
      https_port: new URL(origin).protocol === "https:" ? "443" : "",
      server_protocol: new URL(origin).protocol.replace(":", ""),
      rtmp_port: "",
      timezone: "UTC",
      timestamp_now: nowSec,
      time_now: new Date().toISOString().replace("T", " ").slice(0, 19),
      process: true,
    },
  };
}

async function filteredLiveStreams(categoryId?: string): Promise<unknown[]> {
  const { streams } = await getAggregatedXtreamCatalog();
  const filtered =
    categoryId !== undefined && categoryId !== null && `${categoryId}`.trim() !== ""
      ? streams.filter((r) => r.categoryId === `${categoryId}`.trim())
      : streams;

  return filtered.map((row, idx) => xtreamLiveStreamJson(row, idx + 1));
}

async function loadMovieChannels(): Promise<M3uChannel[]> {
  const out: M3uChannel[] = [];
  for (const src of BUILTIN_PLAYLIST_SOURCES) {
    const row = await prisma.playlistCatalogCache.findUnique({
      where: { presetId: src.presetId },
    });
    if (!row) continue;
    try {
      const parsed = JSON.parse(row.channelsJson) as M3uChannel[];
      if (!Array.isArray(parsed)) continue;
      for (const ch of parsed) {
        if (ch?.name && typeof ch.url === "string") {
          if (resolveLibraryContentType(ch) === "movie") out.push(ch);
        }
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function xtreamVodStreamJson(
  channel: M3uChannel,
  streamId: number,
  categoryId: string,
): Record<string, string | number> {
  return {
    num: streamId,
    name: channel.name,
    stream_type: "movie",
    stream_id: streamId,
    stream_icon: channel.tvgLogo ?? "",
    rating: "",
    rating_5based: 0,
    added: "0",
    category_id: categoryId,
    container_extension: "mp4",
    custom_sid: "",
    direct_source: "",
  };
}

async function filteredVodStreams(categoryId?: string): Promise<unknown[]> {
  const movies = await loadMovieChannels();
  const groupNames = new Set<string>();
  for (const ch of movies) {
    groupNames.add((ch.groupTitle ?? "").trim() || "Movies");
  }
  const sortedGroups = [...groupNames].sort((a, b) => a.localeCompare(b));
  const groupToCatId = new Map<string, string>();
  sortedGroups.forEach((name, idx) => groupToCatId.set(name, String(idx + 1)));

  const filtered =
    categoryId !== undefined && categoryId !== null && `${categoryId}`.trim() !== ""
      ? movies.filter((ch) => {
          const g = (ch.groupTitle ?? "").trim() || "Movies";
          return groupToCatId.get(g) === `${categoryId}`.trim();
        })
      : movies;

  return filtered.map((ch, idx) => {
    const g = (ch.groupTitle ?? "").trim() || "Movies";
    return xtreamVodStreamJson(ch, idx + 1, groupToCatId.get(g) ?? "1");
  });
}

/** Placeholder grid — real listings would pipe iptv-org / XMLTV guides into Xtream-shaped rows. */
function buildPlaceholderEpgListings(streamId: string, slotCount: number): unknown[] {
  const limit = Math.min(96, Math.max(1, slotCount));
  const nowSec = Math.floor(Date.now() / 1000);
  const listings: Record<string, unknown>[] = [];
  for (let i = 0; i < limit; i++) {
    const startSec = nowSec - 900 + i * 900;
    const endSec = startSec + 900;
    const startDt = new Date(startSec * 1000);
    const endDt = new Date(endSec * 1000);
    const isoFmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
    listings.push({
      id: `${streamId}_${startSec}`,
      channel_id: streamId,
      title: "No programme data",
      lang: "en",
      description:
        "Zende placeholder — use xmltv.php or extend server EPG for full listings.",
      start_timestamp: String(startSec),
      stop_timestamp: String(endSec),
      start: isoFmt(startDt),
      end: isoFmt(endDt),
      stop: isoFmt(endDt),
      now_playing: i === 0 ? 1 : 0,
      has_archive: 0,
    });
  }
  return listings;
}

export async function handleXtreamAction(
  request: Request,
  cred: VerifiedIptvCredential,
  portalPasswordEcho: string,
): Promise<Response> {
  const url = new URL(request.url);
  const action = (url.searchParams.get("action") ?? "").trim().toLowerCase();

  if (!action) {
    return Response.json(xtreamAuthenticatedPayload(request, cred, portalPasswordEcho));
  }

  if (action === "get_live_categories") {
    const { categories } = await getAggregatedXtreamCatalog();
    return Response.json(categories);
  }

  if (action === "get_live_streams") {
    const cat = url.searchParams.get("category_id");
    const data = await filteredLiveStreams(cat ?? undefined);
    return Response.json(data);
  }

  if (action === "get_short_epg") {
    const streamId = url.searchParams.get("stream_id")?.trim() ?? "";
    const limitRaw = url.searchParams.get("limit");
    const n = Math.min(24, Math.max(1, parseInt(limitRaw || "4", 10) || 4));

    const { streams } = await getAggregatedXtreamCatalog();
    const row = streams.find((r) => String(r.streamId) === streamId);
    const tvgId = row?.channel.tvgId?.trim();

    if (tvgId) {
      const { createServerLogger } = await import("@/core/logging/server");
      const log = createServerLogger("iptv.xtreamShortEpg");
      const { loadEpgMergeForIds, materializeProgramsFromMerge } = await import(
        "@/lib/epg/build-epg-programs"
      );
      const merge = await loadEpgMergeForIds([tvgId], log);
      const payload = await materializeProgramsFromMerge(merge, [tvgId], log);
      const slot = payload.programs[tvgId];
      const listings: Record<string, unknown>[] = [];
      const slots = [slot?.current, slot?.next].filter(Boolean) as Array<{
        title: string;
        startMs: number;
        stopMs: number;
      }>;
      for (let i = 0; i < Math.min(n, slots.length); i++) {
        const s = slots[i]!;
        const startSec = Math.floor(s.startMs / 1000);
        const stopSec = Math.floor(s.stopMs / 1000);
        const isoFmt = (ms: number) =>
          new Date(ms).toISOString().replace("T", " ").slice(0, 19);
        listings.push({
          id: `${streamId}_${startSec}`,
          channel_id: streamId,
          title: s.title,
          lang: "en",
          description: s.title,
          start_timestamp: String(startSec),
          stop_timestamp: String(stopSec),
          start: isoFmt(s.startMs),
          end: isoFmt(s.stopMs),
          stop: isoFmt(s.stopMs),
          now_playing: i === 0 ? 1 : 0,
          has_archive: 0,
        });
      }
      while (listings.length < n) {
        listings.push(
          ...(buildPlaceholderEpgListings(streamId || "0", n - listings.length) as Record<
            string,
            unknown
          >[]),
        );
      }
      return Response.json({ epg_listings: listings.slice(0, n) });
    }

    const listings = buildPlaceholderEpgListings(streamId || "0", n);
    return Response.json({ epg_listings: listings });
  }

  if (action === "get_simple_date_table") {
    const streamId = url.searchParams.get("stream_id")?.trim() ?? "";
    const listings = buildPlaceholderEpgListings(streamId || "0", 48);
    return Response.json({ epg_listings: listings });
  }

  if (
    action === "get_vod_categories" ||
    action === "get_series_categories" ||
    action === "get_series"
  ) {
    return Response.json([]);
  }

  if (action === "get_vod_streams") {
    const cat = url.searchParams.get("category_id");
    const data = await filteredVodStreams(cat ?? undefined);
    return Response.json(data);
  }

  if (action === "get_vod_info") {
    return Response.json({
      info: [],
      movie_data: {},
      seasons: [],
      episodes: [],
    });
  }

  if (action === "get_series_info") {
    return Response.json({
      seasons: [],
      info: [],
      episodes: {},
    });
  }

  return Response.json([]);
}
