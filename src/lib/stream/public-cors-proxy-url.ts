/**
 * Many IPTV catalogs wrap the real stream in a public CORS bridge, e.g.
 * `https://cors-proxy.cooks.fyi/http://190.11.225.124:5000/live/fs1_hd/playlist.m3u8`
 * The browser needs the wrapper; our Node proxy does not — we fetch the inner URL directly.
 */

/** If `pathname` is `/http://...` or `/https://...`, return that inner absolute URL. */
export function tryExtractEmbeddedTargetUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const m = /^\/(https?:\/\/.+)$/i.exec(u.pathname);
  if (!m?.[1]) return null;
  try {
    return new URL(m[1]).href;
  } catch {
    return null;
  }
}

/**
 * When enabled (default), replace known wrapper URLs with the embedded target.
 * When disabled, return `rawUrl` unchanged so the server still uses the public CORS proxy hop.
 */
export function applyPublicCorsProxyUnwrap(
  rawUrl: string,
  enabled: boolean,
): string {
  if (!enabled) return rawUrl.trim();
  return tryExtractEmbeddedTargetUrl(rawUrl) ?? rawUrl.trim();
}
