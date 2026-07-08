/**
 * IPTV playlist titles often append quality, release year, or flags, e.g.
 * `TSN1 (1080p) [Not 24/7]` or `Dune (2021)`. We show a clean title plus optional badges.
 */

export type ParsedChannelLabel = {
  displayName: string;
  /** E.g. "1080p", "720p", "4K" — shown as a thumbnail badge on live channels */
  resolutionLabel?: string;
  /** E.g. "2021" — release year from `(YYYY)` in VOD titles */
  yearLabel?: string;
};

const RESOLUTION_HEIGHTS = new Set([
  240, 360, 480, 576, 720, 1080, 1440, 2160, 4320,
]);

function isReleaseYear(value: number): boolean {
  return value >= 1900 && value <= 2099;
}

function isResolutionHeight(value: number): boolean {
  return RESOLUTION_HEIGHTS.has(value);
}

/**
 * Strips bracket annotations and parenthesized metadata, returns a short display name.
 */
export function parseChannelLabel(raw: string): ParsedChannelLabel {
  let name = raw.trim();
  if (!name) {
    return { displayName: "Untitled" };
  }

  let resolutionLabel: string | undefined;
  let yearLabel: string | undefined;

  /* [Not 24/7], [Geo-blocked], etc. */
  name = name.replace(/\s*\[[^\]]*\]/g, "").trim();

  /* (1080p), (720p) — explicit quality suffix */
  const explicitQuality = name.match(/\(\s*(\d{3,4})\s*p\s*\)/i);
  if (explicitQuality) {
    resolutionLabel = `${explicitQuality[1]}p`;
    name = name.replace(/\s*\(\s*\d{3,4}\s*p\s*\)/gi, "").trim();
  }

  if (!resolutionLabel) {
    const fk = name.match(/\(\s*(4K|UHD)\s*\)/i);
    if (fk) {
      resolutionLabel = fk[1]!.toUpperCase();
      name = name.replace(/\s*\(\s*(4K|UHD)\s*\)/gi, "").trim();
    }
  }

  if (!resolutionLabel && !yearLabel) {
    const paren = name.match(/\(\s*(\d{3,4})\s*\)/);
    if (paren) {
      const value = Number.parseInt(paren[1]!, 10);
      if (isReleaseYear(value)) {
        yearLabel = String(value);
        name = name.replace(/\s*\(\s*\d{3,4}\s*\)/, "").trim();
      } else if (isResolutionHeight(value)) {
        resolutionLabel = `${value}p`;
        name = name.replace(/\s*\(\s*\d{3,4}\s*\)/, "").trim();
      }
    }
  }

  name = name.replace(/\s+/g, " ").trim();

  return {
    displayName: name || raw.trim(),
    resolutionLabel,
    yearLabel,
  };
}

/** Release year extracted from a channel title, if present. */
export function yearFromChannelName(raw: string): string | null {
  return parseChannelLabel(raw).yearLabel ?? null;
}

/** Badge label for channel art: year on VOD, resolution on live. */
export function channelArtBadgeLabel(
  parsed: ParsedChannelLabel,
  contentType: "live" | "movie" | "series",
): string | undefined {
  if (contentType === "live") return parsed.resolutionLabel;
  return parsed.yearLabel ?? parsed.resolutionLabel;
}
