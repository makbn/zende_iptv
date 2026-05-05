/**
 * Allowlisted upstream XMLTV guide URLs (HTTPS only). Extend via ZENDE_EPG_GUIDE_URLS
 * (comma-separated) for self-hosted guides.
 */

const EXTRA = process.env.ZENDE_EPG_GUIDE_URLS ?? "";

/** Community-hosted sample from iptv-org GUIDES.md (ANT1 Europe + others if added). */
export const DEFAULT_EPG_GUIDE_URLS = [
  "https://worker-9dd4.onrender.com/guide.xml",
] as const;

function parseAllowedHosts(): Set<string> {
  const hosts = new Set<string>(["worker-9dd4.onrender.com"]);
  for (const part of EXTRA.split(",")) {
    const u = part.trim();
    if (!u) continue;
    try {
      hosts.add(new URL(u).hostname);
    } catch {
      /* ignore */
    }
  }
  return hosts;
}

const ALLOWED_HOSTS = parseAllowedHosts();

export function listEpgGuideUrls(): string[] {
  const extra = EXTRA.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_EPG_GUIDE_URLS, ...extra];
}

export function assertAllowedEpgUrl(urlStr: string): URL | null {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return null;
    if (!ALLOWED_HOSTS.has(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}
