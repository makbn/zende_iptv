/**
 * Keep app-relative navigation intact for remote playback. Query parameters carry
 * opaque stream/recording session IDs, so they must reach the target TV.
 */
export function sanitizeRemoteHref(href: string): string | null {
  const value = href.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;

  const hashStart = value.indexOf("#");
  return hashStart === -1 ? value : value.slice(0, hashStart);
}

