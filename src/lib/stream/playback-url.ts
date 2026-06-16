/**
 * Xtream live URLs are often stored as `.ts` (infinite MPEG-TS).
 * Browsers + our HLS proxy need `.m3u8` — same stream id, different container.
 */
export function normalizeXtreamLivePlaybackUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const m = /^(\/live\/[^/]+\/[^/]+\/\d+)\.ts$/i.exec(u.pathname);
    if (!m) return url;
    u.pathname = `${m[1]}.m3u8`;
    return u.href;
  } catch {
    return url;
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

export type PlaybackMode = "hls" | "mpegts" | "progressive";

export function inferPlaybackModeFromUrl(url: string): PlaybackMode {
  const lower = url.trim().toLowerCase();
  if (/\.m3u8(\?|#|$)/.test(lower) || lower.includes("format=m3u8")) return "hls";
  if (/\/live\//.test(lower) && /\.ts(\?|#|$)/.test(lower)) return "mpegts";
  if (/\.(mp4|mkv|webm|m4v|mov)(\?|#|$)/.test(lower)) return "progressive";
  if (/\/movie\//.test(lower) || /\/series\//.test(lower)) return "progressive";
  return "hls";
}
