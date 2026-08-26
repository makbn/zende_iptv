import { inferContentType } from "@/lib/channels/content-type";

/**
 * Minimal Extended M3U parser (EXTINF + stream URL). Suitable for iptv-org style playlists.
 * For edge cases (titles with commas), behavior follows common IPTV tooling heuristics.
 */

export type M3uChannel = {
  name: string;
  url: string;
  duration: number;
  /** Optional content bucket used by Library tabs. */
  contentType?: "live" | "movie" | "series";
  tvgId?: string;
  tvgLogo?: string;
  /** Present when playlist exposes EXTINF `tvg-language` / `language` (e.g. iptv-org). */
  tvgLanguage?: string;
  groupTitle?: string;
  /** Optional notes (manual channels / UI); not part of standard EXTINF. */
  description?: string;
  /** Stable provider ownership; never inferred from the display name. */
  providerId?: string;
  providerName?: string;
  providerChannelId?: string;
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

/** Advance past comment lines to find the next URL in the line array. */
function nextUrl(lines: string[], from: number): { url: string; index: number } | null {
  for (let j = from; j < lines.length; j++) {
    const u = lines[j]?.trim();
    if (!u || u.startsWith("#")) continue;
    return { url: u, index: j };
  }
  return null;
}

/**
 * Parse raw M3U text into channel rows. Invalid lines are skipped.
 * Supports both standard M3U (#EXTINF) and HLS master playlists (#EXT-X-STREAM-INF).
 */
export function parseM3u(text: string): M3uChannel[] {
  const lines = text.split(/\r?\n/);
  const channels: M3uChannel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    // ── Standard M3U channel entry ──────────────────────────────────────────
    if (line.startsWith("#EXTINF")) {
      const m = line.match(/^#EXTINF:([-\d.]+)\s*(.*)$/);
      if (!m) continue;

      const duration = Number.parseFloat(m[1]);
      const rest = m[2] ?? "";
      const comma = rest.lastIndexOf(",");
      if (comma === -1) continue;

      const attrPart = rest.slice(0, comma);
      const name = rest.slice(comma + 1).trim();
      if (!name) continue;

      const next = nextUrl(lines, i + 1);
      if (!next) continue;
      const attrs = parseExtInfAttributes(attrPart);

      channels.push({
        name,
        url: next.url,
        duration: Number.isFinite(duration) ? duration : -1,
        ...attrs,
        contentType: inferContentType(next.url, attrs.groupTitle, name),
      });
      i = next.index;
      continue;
    }

    // ── HLS master playlist variant stream ──────────────────────────────────
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = line.slice("#EXT-X-STREAM-INF:".length);
      const resolution = attrs.match(/\bRESOLUTION=(\d+x\d+)/i)?.[1];
      const bandwidth = attrs.match(/\bBANDWIDTH=(\d+)/i)?.[1];

      // Skip audio-only renditions (no RESOLUTION attribute).
      if (!resolution) continue;

      const height = resolution.split("x")[1] ?? resolution;
      const mbps = bandwidth
        ? (Number(bandwidth) / 1_000_000).toFixed(1)
        : null;
      const name = mbps ? `${height}p · ${mbps} Mbps` : `${height}p`;

      const next = nextUrl(lines, i + 1);
      if (!next) continue;

      channels.push({ name, url: next.url, duration: -1 });
      i = next.index;
      continue;
    }
  }

  return channels;
}
