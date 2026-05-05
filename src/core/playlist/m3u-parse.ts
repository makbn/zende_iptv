/**
 * Minimal Extended M3U parser (EXTINF + stream URL). Suitable for iptv-org style playlists.
 * For edge cases (titles with commas), behavior follows common IPTV tooling heuristics.
 */

export type M3uChannel = {
  name: string;
  url: string;
  duration: number;
  tvgId?: string;
  tvgLogo?: string;
  /** Present when playlist exposes EXTINF `tvg-language` / `language` (e.g. iptv-org). */
  tvgLanguage?: string;
  groupTitle?: string;
};

function parseExtInfAttributes(attrPart: string): Pick<
  M3uChannel,
  "tvgId" | "tvgLogo" | "groupTitle" | "tvgLanguage"
> {
  const tvgId = attrPart.match(/tvg-id="([^"]*)"/)?.[1];
  const tvgLogo = attrPart.match(/tvg-logo="([^"]*)"/)?.[1];
  const groupTitle = attrPart.match(/group-title="([^"]*)"/)?.[1];
  const tvgLanguageRaw =
    attrPart.match(/tvg-language="([^"]*)"/i)?.[1]?.trim() ||
    attrPart.match(/\blanguage="([^"]*)"/i)?.[1]?.trim();
  const tvgLanguage = tvgLanguageRaw?.replace(/\s+/g, " ").trim();
  return {
    ...(tvgId ? { tvgId } : {}),
    ...(tvgLogo ? { tvgLogo } : {}),
    ...(groupTitle ? { groupTitle } : {}),
    ...(tvgLanguage ? { tvgLanguage } : {}),
  };
}

/**
 * Parse raw M3U text into channel rows. Invalid lines are skipped.
 */
export function parseM3u(text: string): M3uChannel[] {
  const lines = text.split(/\r?\n/);
  const channels: M3uChannel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line || !line.startsWith("#EXTINF")) continue;

    const m = line.match(/^#EXTINF:([-\d.]+)\s*(.*)$/);
    if (!m) continue;

    const duration = Number.parseFloat(m[1]);
    const rest = m[2] ?? "";
    const comma = rest.lastIndexOf(",");
    if (comma === -1) continue;

    const attrPart = rest.slice(0, comma);
    const name = rest.slice(comma + 1).trim();
    if (!name) continue;

    let url = "";
    for (let j = i + 1; j < lines.length; j++) {
      const u = lines[j]?.trim();
      if (!u || u.startsWith("#")) continue;
      url = u;
      i = j;
      break;
    }

    if (!url) continue;

    channels.push({
      name,
      url,
      duration: Number.isFinite(duration) ? duration : -1,
      ...parseExtInfAttributes(attrPart),
    });
  }

  return channels;
}
