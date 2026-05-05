/**
 * IPTV playlist titles often append quality and flags, e.g.
 * `TSN1 (1080p) [Not 24/7]`. We show a clean title plus an optional resolution badge.
 */

export type ParsedChannelLabel = {
  displayName: string;
  /** E.g. "1080p", "720p", "4K" — shown as a thumbnail badge */
  resolutionLabel?: string;
};

/**
 * Strips bracket annotations and parenthesized resolution, returns a short display name.
 */
export function parseChannelLabel(raw: string): ParsedChannelLabel {
  let name = raw.trim();
  if (!name) {
    return { displayName: "Untitled" };
  }

  let resolutionLabel: string | undefined;

  /* [Not 24/7], [Geo-blocked], etc. */
  name = name.replace(/\s*\[[^\]]*\]/g, "").trim();

  /* (1080p), (720p), (576p) — digit heights only to avoid eating "(Mirror)" */
  const pq = name.match(/\(\s*(\d{3,4})\s*p?\s*\)/i);
  if (pq) {
    resolutionLabel = `${pq[1]}p`;
    name = name.replace(/\s*\(\s*\d{3,4}\s*p?\s*\)/gi, "").trim();
  }

  if (!resolutionLabel) {
    const fk = name.match(/\(\s*(4K|UHD)\s*\)/i);
    if (fk) {
      resolutionLabel = fk[1]!.toUpperCase();
      name = name.replace(/\s*\(\s*(4K|UHD)\s*\)/gi, "").trim();
    }
  }

  name = name.replace(/\s+/g, " ").trim();

  return {
    displayName: name || raw.trim(),
    resolutionLabel,
  };
}
