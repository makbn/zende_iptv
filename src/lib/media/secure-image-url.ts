/**
 * Convert remote artwork into a same-origin backend relay URL. The browser must
 * never contact playlist, TMDB, or channel-logo hosts directly.
 */
export type SecureImageKind = "logo" | "poster" | "thumbnail";

function encodeRemoteImagePayload(remote: string, kind: SecureImageKind): string {
  const bytes = new TextEncoder().encode(`${kind}\0${remote}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function secureImageUrl(
  url?: string | null,
  origin?: string,
  kind: SecureImageKind = "thumbnail",
): string | undefined {
  const raw = url?.trim();
  if (!raw) return undefined;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  const remote = raw.startsWith("//") ? `https:${raw}` : raw;
  if (!/^https?:\/\//i.test(remote)) return raw;
  const path = `/api/media/image/${encodeRemoteImagePayload(remote, kind)}`;
  if (origin) return new URL(path, origin).href;
  return path;
}
