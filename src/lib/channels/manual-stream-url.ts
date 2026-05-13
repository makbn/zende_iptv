/** Shared http(s) stream URL check for manual channels (client + API). */
export function isAllowedManualStreamUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
