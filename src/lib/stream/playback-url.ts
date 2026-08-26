/**
 * Preserve Xtream's open-ended MPEG-TS endpoint. Some providers allow many
 * concurrent `.ts` feeds but rotate/invalidate account-wide HLS redirect
 * tokens whenever another `.m3u8` channel starts.
 */
export function normalizeXtreamLivePlaybackUrl(url: string): string {
  return url.trim();
}

/** Xtream live endpoints authenticate in the path and do not need a separate cookie warm-up. */
export function isXtreamLiveStreamUrl(url: string): boolean {
  try {
    const pathname = new URL(url.trim()).pathname;
    return /^\/live\/[^/]+\/[^/]+\/[^/]+\.(?:m3u8|ts)$/i.test(pathname);
  } catch {
    return false;
  }
}

/** Root bootstrap on `.ts` is an open-ended live feed — never buffer to arrayBuffer(). */
export function isOpenEndedLiveMpegTsUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return /\/live\//i.test(u.pathname) && /\.ts(\?|$)/i.test(u.pathname);
  } catch {
    return /\.ts(\?|$)/i.test(url);
  }
}

/** Xtream VOD / episode files — must stream through, never buffer whole file. */
export function isProgressiveMediaUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (/\/(movie|series)\//i.test(u.pathname)) return true;
    return /\.(mp4|mkv|webm|m4v|mov|avi)(\?|$)/i.test(u.pathname);
  } catch {
    return /\/(movie|series)\//i.test(url) || /\.(mp4|mkv|webm|m4v|mov|avi)(\?|$)/i.test(url);
  }
}

export function shouldStreamProxyPassthrough(input: {
  request: Request;
  fetchUrl: string;
  isRootBootstrap: boolean;
  upstreamStatus: number;
  contentType: string | null;
}): boolean {
  if (input.isRootBootstrap && isOpenEndedLiveMpegTsUrl(input.fetchUrl)) return true;
  if (isProgressiveMediaUrl(input.fetchUrl)) return true;
  if (input.request.headers.get("range")) return true;
  if (input.upstreamStatus === 206) return true;
  const ct = input.contentType ?? "";
  if (/^video\//i.test(ct)) return true;
  return false;
}

export type PlaybackMode = "hls" | "mpegts" | "progressive";

export function inferPlaybackModeFromUrl(url: string): PlaybackMode {
  const lower = url.trim().toLowerCase();
  if (/\.m3u8(\?|#|$)/.test(lower) || lower.includes("format=m3u8")) return "hls";
  if (/\/live\//.test(lower) && /\.ts(\?|#|$)/.test(lower)) return "mpegts";
  if (/\.(mp4|mkv|webm|m4v|mov)(\?|#|$)/.test(lower)) return "progressive";
  if (/\/movie\//.test(lower) || /\/series\//.test(lower)) return "progressive";
  return "hls";
}
