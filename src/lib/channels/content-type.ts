import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { XTREAM_SERIES_URL_PREFIX } from "@/lib/iptv/xtream-url";

export type LibraryContentType = "live" | "movie" | "series";

/** True when the row is a series container (browse episodes via get_series_info). */
export function isXtreamSeriesContainer(channel: Pick<M3uChannel, "url" | "contentType">): boolean {
  if (channel.contentType === "series") return true;
  return channel.url.trim().startsWith(XTREAM_SERIES_URL_PREFIX);
}

/** Xtream-style URL paths — authoritative over group-title heuristics. */
export function contentTypeFromStreamUrl(url: string): LibraryContentType | null {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith(XTREAM_SERIES_URL_PREFIX)) return "series";
  if (/\/live\//.test(lower)) return "live";
  if (/\/movie\//.test(lower) || /\/vod\//.test(lower)) return "movie";
  if (/\/series\//.test(lower)) return "series";
  return null;
}

function isDirectVideoFile(url: string): boolean {
  return /\.(mp4|mkv|avi|mov|wmv|webm|m4v)(\?|#|$)/i.test(url);
}

function looksLikeEpisodeTitle(name: string): boolean {
  return /\bs\d{1,2}e\d{1,2}\b/i.test(name);
}

/**
 * Classify catalog rows for Library tabs.
 * Movies/Shows must map to actual VOD files, not 24/7 live channels in a "Movies" group.
 */
export function resolveLibraryContentType(channel: M3uChannel): LibraryContentType {
  if (isXtreamSeriesContainer(channel)) return "series";

  const url = channel.url.trim();
  const fromUrl = contentTypeFromStreamUrl(url);
  if (fromUrl) return fromUrl;

  const lowerUrl = url.toLowerCase();
  const name = channel.name ?? "";

  if (isDirectVideoFile(lowerUrl)) {
    return looksLikeEpisodeTitle(name) ? "series" : "movie";
  }

  // Trust explicit import metadata only when URL is not a live HLS edge playlist.
  if (channel.contentType === "movie" || channel.contentType === "series") {
    const isLiveHls =
      /\.m3u8(\?|#|$)/i.test(lowerUrl) &&
      !/\/movie\//.test(lowerUrl) &&
      !/\/series\//.test(lowerUrl);
    if (!isLiveHls) return channel.contentType;
  }

  if (looksLikeEpisodeTitle(name)) return "series";

  return "live";
}

/** Used while parsing M3U / importing Xtream rows. */
export function inferContentType(
  url: string,
  _groupTitle?: string,
  name?: string,
): LibraryContentType {
  return resolveLibraryContentType({
    name: name ?? "",
    url,
    duration: -1,
  });
}
