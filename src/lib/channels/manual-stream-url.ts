/** Shared http(s) stream URL check for manual channels (client + API). */
import { XTREAM_SERIES_URL_PREFIX } from "@/lib/iptv/xtream-url";

export function isAllowedManualStreamUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.startsWith(XTREAM_SERIES_URL_PREFIX)) return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
