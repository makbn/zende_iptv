import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { fetchXtreamSeriesInfo } from "@/lib/iptv/xtream-client";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import { prisma } from "@/lib/db/prisma";
import { parseXtreamDurationSeconds } from "@/lib/playback/stream-session-meta";
import type { XtreamSeriesEpisode } from "@/lib/iptv/xtream-types";
import {
  buildXtreamEpisodeUrl,
  parseXtreamCredentialsFromStreamUrl,
  parseXtreamSeriesIdFromContainerUrl,
} from "@/lib/iptv/xtream-url";

export const runtime = "nodejs";

const querySchema = z.object({
  seriesId: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  tvgId: z.string().min(1).optional(),
});

export type SeriesEpisodeRow = {
  season: string;
  episodeNum: string;
  title: string;
  playUrl: string;
  durationSeconds?: number;
};

function episodeDurationSeconds(ep: XtreamSeriesEpisode): number | undefined {
  const fromInfo = parseXtreamDurationSeconds(ep.info);
  if (fromInfo) return fromInfo;
  if (typeof ep.duration === "number" && ep.duration > 0) return ep.duration;
  if (typeof ep.duration === "string" && /^\d+$/.test(ep.duration.trim())) {
    return Number.parseInt(ep.duration.trim(), 10);
  }
  return undefined;
}

function flattenEpisodes(
  episodes: Record<string, XtreamSeriesEpisode[]> | undefined,
  creds: { serverUrl: string; username: string; password: string },
): SeriesEpisodeRow[] {
  if (!episodes) return [];
  const rows: SeriesEpisodeRow[] = [];
  for (const [seasonKey, seasonEpisodes] of Object.entries(episodes)) {
    for (const ep of seasonEpisodes ?? []) {
      const playUrl = buildXtreamEpisodeUrl(creds, ep);
      if (!playUrl) continue;
      rows.push({
        season: String(ep.season ?? seasonKey),
        episodeNum: String(ep.episode_num ?? ""),
        title: String(ep.title ?? `Episode ${ep.id}`),
        playUrl,
        ...(episodeDurationSeconds(ep) ? { durationSeconds: episodeDurationSeconds(ep) } : {}),
      });
    }
  }
  rows.sort((a, b) => {
    const sa = Number.parseInt(a.season, 10) || 0;
    const sb = Number.parseInt(b.season, 10) || 0;
    if (sa !== sb) return sa - sb;
    const ea = Number.parseInt(a.episodeNum, 10) || 0;
    const eb = Number.parseInt(b.episodeNum, 10) || 0;
    return ea - eb;
  });
  return rows;
}

/** Resolve Xtream series seasons/episodes with playable `/series/…` URLs (IPTVnator get_series_info). */
export async function GET(request: Request) {
  return withApiLogging("api.xtream.series-info", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      seriesId: url.searchParams.get("seriesId") ?? undefined,
      url: url.searchParams.get("url") ?? undefined,
      tvgId: url.searchParams.get("tvgId") ?? undefined,
    });
    if (!parsed.success) {
      log.warn("invalid query");
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    let seriesId = parsed.data.seriesId?.trim() ?? "";
    if (!seriesId && parsed.data.url) {
      seriesId = parseXtreamSeriesIdFromContainerUrl(parsed.data.url) ?? "";
      if (!seriesId) {
        const legacy = parsed.data.url.match(/\/series\/[^/]+\/[^/]+\/(\d+)\./i);
        seriesId = legacy?.[1] ?? "";
      }
    }
    if (!seriesId && parsed.data.tvgId) {
      const fromTvg = parsed.data.tvgId.match(/^xtream-series:(.+)$/);
      seriesId = fromTvg?.[1]?.trim() ?? "";
    }
    if (!seriesId) {
      log.warn("missing seriesId");
      return NextResponse.json({ error: "seriesId required" }, { status: 400 });
    }

    const scoped = /^([^:]+):(.+)$/.exec(seriesId);
    const provider = scoped
      ? await prisma.iptvProvider.findUnique({ where: { id: scoped[1] } })
      : null;
    if (provider && scoped) seriesId = scoped[2];
    const providerCreds = provider?.serverUrl && provider.username && provider.password
      ? { serverUrl: provider.serverUrl, username: provider.username, password: provider.password }
      : null;
    const creds =
      providerCreds ??
      (parsed.data.url ? parseXtreamCredentialsFromStreamUrl(parsed.data.url) : null) ??
      (await loadXtreamPortalCredentials());
    if (!creds) {
      log.warn("no xtream portal credentials", { seriesId });
      return NextResponse.json(
        { error: "No Xtream portal configured. Re-import your account in Settings." },
        { status: 422 },
      );
    }

    log.info("fetching series info", { seriesId, server: creds.serverUrl });
    const info = await fetchXtreamSeriesInfo(creds, seriesId);
    if (!info) {
      log.error("get_series_info returned nothing", { seriesId });
      return NextResponse.json({ error: "Could not load series from portal." }, { status: 502 });
    }

    const episodes = flattenEpisodes(info.episodes, creds);
    log.info("series info loaded", {
      seriesId,
      episodeCount: episodes.length,
      seasonCount: info.seasons?.length ?? 0,
    });
    return NextResponse.json({
      seriesId,
      info: info.info ?? {},
      seasons: info.seasons ?? [],
      episodes,
    });
  });
}
