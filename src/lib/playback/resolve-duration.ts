import "server-only";

import { fetchXtreamSeriesInfo, fetchXtreamVodInfo } from "@/lib/iptv/xtream-client";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import type { XtreamSeriesEpisode } from "@/lib/iptv/xtream-types";
import {
  parseXtreamCredentialsFromStreamUrl,
  parseXtreamEpisodeIdFromStreamUrl,
  parseXtreamVodIdFromStreamUrl,
} from "@/lib/iptv/xtream-url";
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
