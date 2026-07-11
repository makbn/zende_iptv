import type { XtreamCredentials, XtreamSeriesEpisode, XtreamVodInfo } from "@/lib/iptv/xtream-types";

/** Sentinel URL for a series container row (not directly playable). */
export const XTREAM_SERIES_URL_PREFIX = "zende://series/";

export function buildXtreamSeriesContainerUrl(seriesId: string | number): string {
  return `${XTREAM_SERIES_URL_PREFIX}${encodeURIComponent(String(seriesId))}`;
}

export function parseXtreamSeriesIdFromContainerUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith(XTREAM_SERIES_URL_PREFIX)) return null;
  const id = decodeURIComponent(trimmed.slice(XTREAM_SERIES_URL_PREFIX.length)).trim();
  return id || null;
}

function normalizeServerUrl(serverUrl: string): string {
  const raw = serverUrl.trim();
  const withProto =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `http://${raw}`;
  const u = new URL(withProto);
  return `${u.protocol}//${u.host}`;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

/**
 * Live: `{server}/live/{user}/{pass}/{streamId}.{format}`
 * IPTVnator: XtreamUrlService.constructLiveUrl
 */
export function buildXtreamLiveUrl(
  creds: XtreamCredentials,
  streamId: string | number,
  format = "ts",
): string {
  const server = normalizeServerUrl(creds.serverUrl);
  const user = encodePathSegment(creds.username);
  const pass = encodePathSegment(creds.password);
  const fmt = (format || creds.liveFormat || "m3u8").trim() || "m3u8";
  return `${server}/live/${user}/${pass}/${encodeURIComponent(String(streamId))}.${fmt}`;
}

/**
 * Movie: `{server}/movie/{user}/{pass}/{streamId}.{ext}`
 * IPTVnator: XtreamUrlService.constructVodUrl
 */
export function buildXtreamMovieUrl(
  creds: XtreamCredentials,
  streamId: string | number,
  containerExtension: string,
): string {
  const server = normalizeServerUrl(creds.serverUrl);
  const user = encodePathSegment(creds.username);
  const pass = encodePathSegment(creds.password);
  const ext = containerExtension.trim() || "mp4";
  return `${server}/movie/${user}/${pass}/${encodeURIComponent(String(streamId))}.${encodeURIComponent(ext)}`;
}

export function buildXtreamMovieUrlFromVodInfo(
  creds: XtreamCredentials,
  vod: XtreamVodInfo,
): string {
  const streamId = vod.movie_data?.stream_id;
  const ext = vod.movie_data?.container_extension;
  if (streamId == null || !ext) return "";
  return buildXtreamMovieUrl(creds, streamId, ext);
}

/**
 * Episode: `{server}/series/{user}/{pass}/{episodeId}.{ext}`
 * IPTVnator: XtreamUrlService.constructEpisodeUrl
 */
export function buildXtreamEpisodeUrl(
  creds: XtreamCredentials,
  episode: Pick<XtreamSeriesEpisode, "id" | "container_extension">,
): string {
  const server = normalizeServerUrl(creds.serverUrl);
  const user = encodePathSegment(creds.username);
  const pass = encodePathSegment(creds.password);
  const ext = episode.container_extension.trim() || "mp4";
  return `${server}/series/${user}/${pass}/${encodeURIComponent(String(episode.id))}.${encodeURIComponent(ext)}`;
}

function parseXtreamIdFromBucketUrl(url: string, bucket: "movie" | "series" | "live"): string | null {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== bucket || parts.length < 4) return null;
    const file = parts[3] ?? "";
    const m = /^(\d+)\./.exec(file);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function parseXtreamVodIdFromStreamUrl(url: string): string | null {
  return parseXtreamIdFromBucketUrl(url, "movie");
}

export function parseXtreamEpisodeIdFromStreamUrl(url: string): string | null {
  return parseXtreamIdFromBucketUrl(url, "series");
}

/** Extract Xtream portal credentials embedded in `/live|movie|series/` URLs. */
export function parseXtreamCredentialsFromStreamUrl(url: string): XtreamCredentials | null {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 4) return null;
    const [bucket, username, password] = parts;
    if (bucket !== "live" && bucket !== "movie" && bucket !== "series") return null;
    if (!username || !password) return null;
    return {
      serverUrl: `${u.protocol}//${u.host}`,
      username: decodeURIComponent(username),
      password: decodeURIComponent(password),
    };
  } catch {
    return null;
  }
}
