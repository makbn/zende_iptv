/**
 * Samsung Tizen 3.x (~Chromium 47) and similar old TV browsers cannot run the
 * Next.js 16 app (requires Chrome 111+). Detect them so we can serve /legacy/.
 */

const LEGACY_TIZEN_MAX_MAJOR = 3.99;
const LEGACY_TV_CHROME_MAX = 62;

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
  return /smart-tv|smarttv|tizen|webos|web0s|hbbtv|netcast|viera|bravia|philips|aft|firetv|appletv|crkey|android tv|googletv/i.test(
    userAgent,
  );
}

/** True for Samsung Tizen 3.x and other TV browsers stuck on pre-2018 Chromium. */
export function isLegacyTvBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;

  const tizenMajor = parseTizenMajorVersion(userAgent);
  if (tizenMajor != null && tizenMajor <= LEGACY_TIZEN_MAX_MAJOR) {
    return true;
  }

  if (!isTvUserAgent(userAgent)) return false;

  const chromeMajor = parseChromeMajorVersion(userAgent);
  if (chromeMajor != null && chromeMajor <= LEGACY_TV_CHROME_MAX) {
    return true;
  }

  // webOS 3.x ships Chromium 38 without a Chrome token in some builds.
  if (/webos|web0s/i.test(userAgent) && !chromeMajor) {
    return true;
  }

  return false;
}
