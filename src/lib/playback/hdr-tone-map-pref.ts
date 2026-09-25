const STORAGE_KEY = "zende.playback.hdrToneMap";

/**
 * Opt-in HDR→SDR conversion during the compatibility transcoder.
 * Default **off**: home relays should stay fast; Tizen/Safari already differ
 * because of native HDR vs H.264 remux, not because we must color-grade on CPU.
 */
export function readHdrToneMapPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function writeHdrToneMapPref(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Append `hdr=1` / `hdr=0` on a compatibility playlist URL from the client pref. */
export function withHdrToneMapQuery(playbackUrl: string, enabled: boolean): string {
  if (!playbackUrl.includes("/api/stream/transcode/")) return playbackUrl;
  try {
    const url = new URL(playbackUrl, "http://zende.local");
    url.searchParams.set("hdr", enabled ? "1" : "0");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return playbackUrl;
  }
}
