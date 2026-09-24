import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { fetchXtreamSeriesInfo } from "@/lib/iptv/xtream-client";
import {
  isProviderInfoFresh,
  readCachedSeriesInfo,
  writeCachedSeriesInfo,
} from "@/lib/iptv/series-info-cache";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import { prisma } from "@/lib/db/prisma";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { getCachedMediaMetadata } from "@/lib/media/media-metadata-service";
import { parseXtreamDurationSeconds } from "@/lib/playback/stream-session-meta";
import type { XtreamSeriesEpisode } from "@/lib/iptv/xtream-types";
import {
  activeXtreamServerUrl,
  buildXtreamEpisodeUrl,
  parseXtreamCredentialsFromStreamUrl,
  parseXtreamSeriesIdFromContainerUrl,
  buildXtreamSeriesContainerUrl,
} from "@/lib/iptv/xtream-url";

export const runtime = "nodejs";

const querySchema = z.object({
  seriesId: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  tvgId: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  title: z.string().min(1).max(300).optional(),
});

export type SeriesEpisodeRow = {
  season: string;
  episodeNum: string;
  title: string;
  playUrl: string;
  durationSeconds?: number;
  artworkUrl?: string;
  overview?: string;
  airDate?: string;
  rating?: number;
};

function firstText(source: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find((candidate) => typeof candidate === "string" && candidate.trim());
      if (typeof first === "string") return first.trim();
    }
  }
  return undefined;
}

function episodeRating(info: Record<string, unknown> | undefined): number | undefined {
  if (!info) return undefined;
  for (const key of ["rating", "rating_5based", "vote_average"]) {
    const value = info[key];
    const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

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
        ...(firstText(ep.info, ["movie_image", "cover_big", "cover", "image", "thumbnail"])
          ? { artworkUrl: firstText(ep.info, ["movie_image", "cover_big", "cover", "image", "thumbnail"]) }
          : {}),
        ...(firstText(ep.info, ["plot", "description", "overview"])
          ? { overview: firstText(ep.info, ["plot", "description", "overview"]) }
          : {}),
        ...(firstText(ep.info, ["releasedate", "releaseDate", "air_date", "airDate"])
          ? { airDate: firstText(ep.info, ["releasedate", "releaseDate", "air_date", "airDate"]) }
          : {}),
        ...(episodeRating(ep.info) ? { rating: episodeRating(ep.info) } : {}),
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
      channelId: url.searchParams.get("channelId") ?? undefined,
      title: url.searchParams.get("title") ?? undefined,
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

    const requestedSeriesId = seriesId;
    const scoped = /^([^:]+):(.+)$/.exec(seriesId);
    let providerChannel = parsed.data.channelId
      ? await prisma.iptvProviderChannel.findUnique({
          where: { id: parsed.data.channelId },
          include: { provider: true },
        })
      : null;
    const provider = scoped
      ? await prisma.iptvProvider.findUnique({ where: { id: scoped[1] } })
      : providerChannel?.provider ?? null;
    if (provider && scoped) seriesId = scoped[2];
    if (!providerChannel && provider) {
      providerChannel = await prisma.iptvProviderChannel.findFirst({
        where: {
          providerId: provider.id,
          url: buildXtreamSeriesContainerUrl(seriesId),
        },
        include: { provider: true },
      });
    }
    const activeServer = provider ? activeXtreamServerUrl(provider) : null;
    const providerCreds = activeServer && provider?.username && provider.password
      ? { serverUrl: activeServer, username: provider.username, password: provider.password }
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

    const providerKey = provider?.id ?? creds.serverUrl;
    const cached =
      (await readCachedSeriesInfo(providerKey, seriesId)) ??
      (providerKey === creds.serverUrl
        ? null
        : await readCachedSeriesInfo(creds.serverUrl, seriesId));
    let info = cached && isProviderInfoFresh(cached.cachedAt) ? cached.info : null;
    let stale = false;
    let cachedAt = info ? cached?.cachedAt : undefined;
    if (info) {
      log.info("serving fresh cached series info", { seriesId, cachedAt });
    } else {
      log.info("fetching series info", { seriesId, server: creds.serverUrl });
      info = await fetchXtreamSeriesInfo(creds, seriesId);
      if (!info) {
        if (!cached) {
          log.error("get_series_info returned nothing and no cached copy exists", { seriesId });
          return NextResponse.json(
            { error: "The series provider is temporarily unreachable. Try again shortly." },
            { status: 502 },
          );
        }
        info = cached.info;
        stale = true;
        cachedAt = cached.cachedAt;
        log.warn("serving cached series info after provider failure", { seriesId, cachedAt });
      } else {
        cachedAt = new Date().toISOString();
        await Promise.all([
          writeCachedSeriesInfo(providerKey, seriesId, info),
          providerKey === creds.serverUrl
            ? Promise.resolve()
            : writeCachedSeriesInfo(creds.serverUrl, seriesId, info),
        ]).catch((error) => {
          log.warn("could not persist series info cache", {
            seriesId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }

    const episodes = flattenEpisodes(info.episodes, creds);
    const portalInfo = (info.info ?? {}) as Record<string, unknown>;
    const providerTitle =
      typeof portalInfo.name === "string" && portalInfo.name.trim()
        ? portalInfo.name.trim()
        : providerChannel?.name ?? parsed.data.title ?? "Untitled show";
    const parsedTitle = parseChannelLabel(providerTitle);
    const metadata = await getCachedMediaMetadata({
      mediaKey: providerChannel
        ? `channel:${providerChannel.id}`
        : `series:${requestedSeriesId}`,
      providerChannelId: providerChannel?.id,
      mediaType: "tv",
      title: parsedTitle.displayName,
      year: parsedTitle.yearLabel,
      portalInfo,
    }).catch((error) => {
      log.error("series metadata cache failed", {
        seriesId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
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
      metadata,
      stale,
      ...(cachedAt ? { cachedAt } : {}),
    });
  });
}
