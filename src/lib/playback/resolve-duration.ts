import "server-only";

import { fetchXtreamSeriesInfo, fetchXtreamVodInfo } from "@/lib/iptv/xtream-client";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import type { XtreamSeriesEpisode } from "@/lib/iptv/xtream-types";
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
    const vod = await fetchXtreamVodInfo(creds, vodId);
    return parseXtreamDurationSeconds(vod?.info as Record<string, unknown> | undefined);
  }

  const episodeId = parseXtreamEpisodeIdFromStreamUrl(upstreamUrl);
  if (episodeId && meta.seriesId) {
    const info = await fetchXtreamSeriesInfo(creds, meta.seriesId);
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
  const raw =
    info.imdb ??
    info.imdb_id ??
    info.imdbId ??
    info.tmdb_id ??
    info.tmdb;
  if (raw == null) return undefined;
  const value = String(raw).trim().replace(/^tt/i, "");
  return /^\d{5,10}$/.test(value) ? value : undefined;
}

function extractYear(info?: Record<string, unknown>): string | undefined {
  if (!info) return undefined;
  const raw = info.year ?? info.releasedate ?? info.release_date ?? info.releaseDate;
  if (raw == null) return undefined;
  const text = String(raw).trim();
  const match = /^(\d{4})/.exec(text);
  return match?.[1];
}

/** Enrich VOD session metadata used for subtitle search. */
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

  if (next.imdbId) return next;

  const creds =
    (await loadXtreamPortalCredentials()) ??
    parseXtreamCredentialsFromStreamUrl(upstreamUrl);
  if (!creds) return next;

  const vodId = parseXtreamVodIdFromStreamUrl(upstreamUrl);
  if (vodId) {
    const vod = await fetchXtreamVodInfo(creds, vodId);
    const info = vod?.info as Record<string, unknown> | undefined;
    next = {
      ...next,
      imdbId: extractImdbId(info) ?? next.imdbId,
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
    const series = await fetchXtreamSeriesInfo(creds, meta.seriesId);
    const seriesInfo = series?.info as Record<string, unknown> | undefined;
    next = {
      ...next,
      imdbId: extractImdbId(seriesInfo) ?? next.imdbId,
      year: next.year ?? extractYear(seriesInfo),
      seriesTitle:
        next.seriesTitle?.trim() ||
        (typeof seriesInfo?.name === "string" ? seriesInfo.name.trim() : undefined) ||
        next.seriesTitle,
    };
  }

  return next;
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
