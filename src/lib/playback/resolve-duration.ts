import "server-only";

import { prisma } from "@/lib/db/prisma";
import { fetchXtreamSeriesInfo, fetchXtreamVodInfo } from "@/lib/iptv/xtream-client";
import {
  isProviderInfoFresh,
  readCachedSeriesInfo,
  readCachedVodInfo,
  writeCachedSeriesInfo,
  writeCachedVodInfo,
} from "@/lib/iptv/series-info-cache";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import type {
  XtreamCredentials,
  XtreamSeriesEpisode,
  XtreamSeriesInfo,
  XtreamVodInfo,
} from "@/lib/iptv/xtream-types";
import {
  parseXtreamCredentialsFromStreamUrl,
  parseXtreamEpisodeIdFromStreamUrl,
  parseXtreamVodIdFromStreamUrl,
} from "@/lib/iptv/xtream-url";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import {
  parseXtreamDurationSeconds,
  type PlaybackSessionMeta,
} from "@/lib/playback/stream-session-meta";

function episodeDurationSeconds(ep: XtreamSeriesEpisode): number | undefined {
  const fromInfo = parseXtreamDurationSeconds(
    ep.info && typeof ep.info === "object"
      ? (ep.info as Record<string, unknown>)
      : undefined,
  );
  if (fromInfo) return fromInfo;
  const raw = (ep as { duration?: unknown }).duration;
  if (typeof raw === "number" && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return Number.parseInt(raw.trim(), 10);
  }
  return undefined;
}

/** Strip `providerId:externalId` so Xtream API / disk cache keys stay consistent. */
export function xtreamExternalId(seriesOrVodId: string): string {
  const scoped = /^([^:]+):(.+)$/.exec(seriesOrVodId.trim());
  return scoped?.[2] ?? seriesOrVodId.trim();
}

/** Best-effort runtime for movies/episodes when the client did not supply one. */
export async function resolvePlaybackDurationSeconds(
  upstreamUrl: string,
  meta: PlaybackSessionMeta,
): Promise<number | undefined> {
  if (meta.durationSeconds != null && meta.durationSeconds > 0) {
    return meta.durationSeconds;
  }

  const creds =
    (await loadXtreamPortalCredentials()) ??
    parseXtreamCredentialsFromStreamUrl(upstreamUrl);
  if (!creds) return undefined;

  const vodId = parseXtreamVodIdFromStreamUrl(upstreamUrl);
  if (vodId) {
    const vod = await loadVodInfo(creds, vodId);
    return parseXtreamDurationSeconds(vod?.info as Record<string, unknown> | undefined);
  }

  const episodeId = parseXtreamEpisodeIdFromStreamUrl(upstreamUrl);
  if (episodeId && meta.seriesId) {
    const info = await loadSeriesInfo(creds, meta.seriesId);
    if (!info?.episodes) return undefined;
    for (const seasonEpisodes of Object.values(info.episodes)) {
      for (const ep of seasonEpisodes ?? []) {
        if (String(ep.id) === episodeId) {
          return episodeDurationSeconds(ep);
        }
      }
    }
  }

  return undefined;
}

function extractImdbId(info?: Record<string, unknown>): string | undefined {
  if (!info) return undefined;
  const raw = info.imdb ?? info.imdb_id ?? info.imdbId;
  if (raw == null) return undefined;
  const text = String(raw).trim();
  const withTt = text.match(/tt\d{5,10}/i)?.[0];
  if (withTt) return withTt.toLowerCase();
  const digits = text.replace(/^tt/i, "");
  return /^\d{5,10}$/.test(digits) ? `tt${digits.padStart(7, "0")}` : undefined;
}

function extractTmdbId(info?: Record<string, unknown>): string | undefined {
  if (!info) return undefined;
  const raw = info.tmdb_id ?? info.tmdb ?? info.tmdbId;
  if (raw == null) return undefined;
  const digits = String(raw).trim().match(/^\d{1,10}$/)?.[0];
  return digits;
}

function extractYear(info?: Record<string, unknown>): string | undefined {
  if (!info) return undefined;
  const raw = info.year ?? info.releasedate ?? info.release_date ?? info.releaseDate;
  if (raw == null) return undefined;
  const text = String(raw).trim();
  const match = /^(\d{4})/.exec(text);
  return match?.[1];
}

async function idsFromMediaMetadataCache(
  meta: PlaybackSessionMeta,
): Promise<{ imdbId?: string; tmdbId?: string }> {
  const seriesId = meta.seriesId?.trim();
  if (!seriesId) return {};

  const scoped = /^([^:]+):(.+)$/.exec(seriesId);
  if (scoped) {
    const channel = await prisma.iptvProviderChannel.findFirst({
      where: {
        providerId: scoped[1],
        OR: [{ externalKey: scoped[2] }, { url: { contains: scoped[2] } }],
      },
      select: {
        mediaMetadata: { select: { imdbId: true, tmdbId: true } },
      },
    });
    const ids = channel?.mediaMetadata;
    if (ids?.imdbId || ids?.tmdbId) {
      return {
        ...(ids.imdbId ? { imdbId: ids.imdbId } : {}),
        ...(ids.tmdbId ? { tmdbId: ids.tmdbId } : {}),
      };
    }
  }

  const keys = [`series:${seriesId}`, `series:${xtreamExternalId(seriesId)}`];
  const row = await prisma.mediaMetadataCache.findFirst({
    where: { OR: keys.map((mediaKey) => ({ mediaKey })) },
    select: { imdbId: true, tmdbId: true },
  });
  return {
    ...(row?.imdbId ? { imdbId: row.imdbId } : {}),
    ...(row?.tmdbId ? { tmdbId: row.tmdbId } : {}),
  };
}

/** Enrich VOD session metadata used for subtitle search and skip-intro. */
export async function enrichPlaybackSearchMeta(
  upstreamUrl: string,
  meta: PlaybackSessionMeta,
  title: string,
): Promise<PlaybackSessionMeta> {
  const parsed = parseChannelLabel(title);
  let next: PlaybackSessionMeta = {
    ...meta,
    searchTitle: meta.searchTitle?.trim() || parsed.displayName,
    year: meta.year?.trim() || parsed.yearLabel,
  };

  if (next.imdbId && next.tmdbId) return next;

  const fromCache: { imdbId?: string; tmdbId?: string } = await idsFromMediaMetadataCache(
    next,
  ).catch(() => ({}));
  next = {
    ...next,
    imdbId: next.imdbId ?? fromCache.imdbId,
    tmdbId: next.tmdbId ?? fromCache.tmdbId,
  };
  if (next.imdbId && next.tmdbId) return next;

  const creds =
    (await loadXtreamPortalCredentials()) ??
    parseXtreamCredentialsFromStreamUrl(upstreamUrl);
  if (!creds) return next;

  const vodId = parseXtreamVodIdFromStreamUrl(upstreamUrl);
  if (vodId) {
    const vod = await loadVodInfo(creds, vodId);
    const info = vod?.info as Record<string, unknown> | undefined;
    next = {
      ...next,
      imdbId: next.imdbId ?? extractImdbId(info),
      tmdbId: next.tmdbId ?? extractTmdbId(info),
      year: next.year ?? extractYear(info),
      searchTitle:
        next.searchTitle ??
        (typeof info?.name === "string" ? info.name.trim() : undefined) ??
        (typeof vod?.movie_data?.name === "string"
          ? vod.movie_data.name.trim()
          : undefined),
    };
    return next;
  }

  const episodeId = parseXtreamEpisodeIdFromStreamUrl(upstreamUrl);
  if (episodeId && meta.seriesId) {
    const series = await loadSeriesInfo(creds, meta.seriesId);
    const seriesInfo = series?.info as Record<string, unknown> | undefined;
    next = {
      ...next,
      imdbId: next.imdbId ?? extractImdbId(seriesInfo),
      tmdbId: next.tmdbId ?? extractTmdbId(seriesInfo),
      year: next.year ?? extractYear(seriesInfo),
      seriesTitle:
        next.seriesTitle?.trim() ||
        (typeof seriesInfo?.name === "string" ? seriesInfo.name.trim() : undefined) ||
        next.seriesTitle,
    };
  }

  return next;
}

async function loadSeriesInfo(
  creds: XtreamCredentials,
  seriesId: string,
): Promise<XtreamSeriesInfo | null> {
  const id = xtreamExternalId(seriesId);
  const cached = await readCachedSeriesInfo(creds.serverUrl, id);
  if (cached && isProviderInfoFresh(cached.cachedAt)) return cached.info;
  const fetched = await fetchXtreamSeriesInfo(creds, id);
  if (fetched) {
    await writeCachedSeriesInfo(creds.serverUrl, id, fetched).catch(() => undefined);
    return fetched;
  }
  return cached?.info ?? null;
}

async function loadVodInfo(
  creds: XtreamCredentials,
  vodId: string,
): Promise<XtreamVodInfo | null> {
  const cached = await readCachedVodInfo(creds.serverUrl, vodId);
  if (cached && isProviderInfoFresh(cached.cachedAt)) return cached.info;
  const fetched = await fetchXtreamVodInfo(creds, vodId);
  if (fetched) {
    await writeCachedVodInfo(creds.serverUrl, vodId, fetched).catch(() => undefined);
    return fetched;
  }
  return cached?.info ?? null;
}

export function inferContentKindFromUrl(url: string): PlaybackSessionMeta["contentKind"] {
  try {
    const parts = new URL(url.trim()).pathname.split("/").filter(Boolean);
    const bucket = parts[0]?.toLowerCase();
    if (bucket === "movie") return "movie";
    if (bucket === "series") return "episode";
    if (bucket === "live") return "live";
  } catch {
    /* ignore */
  }
  return undefined;
}
