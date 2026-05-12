const STORAGE_KEY = "zenede.unwrapPublicCorsProxyUrls";

/** Default true: server-side proxy should hit the real origin, not a browser CORS bridge. */
export function readUnwrapPublicCorsProxyUrlsPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function writeUnwrapPublicCorsProxyUrlsPref(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
