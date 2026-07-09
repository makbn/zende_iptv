/** Prefer HTTPS for remote poster/logo URLs (avoids mixed-content on HTTPS pages). */
export function secureImageUrl(url?: string | null): string | undefined {
  const raw = url?.trim();
  if (!raw) return undefined;
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  return raw;
}
