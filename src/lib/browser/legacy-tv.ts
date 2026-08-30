/**
 * Old TV browsers (Samsung Tizen ≤6.0, LG webOS ≤5.x, etc.) cannot run the
 * Next.js 16 / React 19 app — bundles use syntax and APIs from Chrome 85+.
 * Detect them so middleware can serve the ES5 `/legacy/` client instead.
 */

/** Tizen 6.0 and below ship Chromium ≤76. */
const LEGACY_TIZEN_MAX_MAJOR = 6.0;
/**
 * TV Chromium below 85 lacks optional chaining / other syntax in app bundles.
 * Tizen 6.5 (Chrome 85) is the oldest Samsung generation that runs the full app.
 */
const LEGACY_TV_CHROME_MAX = 84;

export function parseTizenMajorVersion(userAgent: string): number | null {
  const match = userAgent.match(/Tizen[/\s](\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const major = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(major) ? major : null;
}

export function parseChromeMajorVersion(userAgent: string): number | null {
  const match = userAgent.match(/Chrome\/(\d+)/i);
  if (!match) return null;
  const major = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(major) ? major : null;
}

function isTvUserAgent(userAgent: string): boolean {
  return /smart-tv|smarttv|tizen|webos|web0s|hbbtv|netcast|viera|bravia|philips|aft|firetv|appletv|crkey|android tv|googletv|orsay|maple|nettv|se_browser|omi\/|opera tv|whaletv|tolka/i.test(
    userAgent,
  );
}

/** True for TV browsers that need the ES5 `/legacy/` client. */
export function isLegacyTvBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;

  const tizenMajor = parseTizenMajorVersion(userAgent);
  if (tizenMajor != null) {
    // Tizen's version is authoritative. New Samsung TV user agents can omit
    // the Chrome token even though their web runtime supports the full app.
    return tizenMajor <= LEGACY_TIZEN_MAX_MAJOR;
  }

  if (!isTvUserAgent(userAgent)) return false;

  const chromeMajor = parseChromeMajorVersion(userAgent);
  // Many TV builds omit a Chrome token (webOS 3.x, old Fire TV, NetCast).
  if (chromeMajor == null) return true;
  if (chromeMajor <= LEGACY_TV_CHROME_MAX) return true;

  return false;
}
