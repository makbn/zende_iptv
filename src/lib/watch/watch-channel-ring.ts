import type { M3uChannel } from "@/core/playlist/m3u-parse";

import type { ViewingEntry } from "@/lib/watch/viewing-stats";

/** Dummy stats for catalog fillers (ring navigation only uses url / metadata). */
export function m3uChannelToRingEntry(ch: M3uChannel): ViewingEntry {
  return {
    url: ch.url,
    name: ch.name,
    ...(ch.tvgLogo ? { tvgLogo: ch.tvgLogo } : {}),
    ...(ch.groupTitle ? { groupTitle: ch.groupTitle } : {}),
    lastOpenedAt: 0,
    openCount: 0,
  };
}

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Split iptv-style `group-title` (e.g. `News;United Kingdom`) into comparable segments. */
export function segmentizeGroupTitle(groupTitle?: string): Set<string> {
  const out = new Set<string>();
  if (!groupTitle) return out;
  for (const part of groupTitle.split(/[;,|]/)) {
    const t = normalizeToken(part);
    if (t.length >= 2) out.add(t);
  }
  return out;
}

function scoreCatalogChannel(
  ch: M3uChannel,
  ctx: {
    frequentSegments: Set<string>;
    frequentGroupsNorm: Set<string>;
    currentSegments: Set<string>;
    currentGroupNorm: string;
  },
): number {
  let score = 0;
  const g = ch.groupTitle ? normalizeToken(ch.groupTitle) : "";
  const segs = segmentizeGroupTitle(ch.groupTitle);

  if (ctx.currentGroupNorm && g === ctx.currentGroupNorm) {
    score += 160;
  }
  for (const s of segs) {
    if (ctx.currentSegments.has(s)) score += 100;
  }

  for (const s of segs) {
    if (ctx.frequentSegments.has(s)) score += 92;
  }
  if (g && ctx.frequentGroupsNorm.has(g)) {
    score += 84;
  }

  for (const fg of ctx.frequentGroupsNorm) {
    if (fg.length >= 4 && (g.includes(fg) || fg.includes(g))) {
      score += 38;
    }
  }

  return score;
}

/**
 * Builds a ring of up to `targetSize` channels: **frequent-first** (by play count),
 * then fills from the M3U catalog with **similarity-first** scoring (shared `group-title`
 * segments — often category + region in iptv-org lists), then **random** tie-breaks.
 */
export function padFrequentRingWithCatalog(
  frequentOrdered: ViewingEntry[],
  catalog: M3uChannel[],
  options: {
    targetSize: number;
    /** Current `/watch?group=` — boosts channels in the same bucket you're watching. */
    currentGroupTitle?: string | null;
  },
): ViewingEntry[] {
  const target = Math.max(0, options.targetSize);
  const seen = new Set<string>();
  const out: ViewingEntry[] = [];

  for (const e of frequentOrdered) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    out.push(e);
    if (out.length >= target) return out.slice(0, target);
  }

  const needed = target - out.length;
  if (needed <= 0 || catalog.length === 0) {
    return out;
  }

  const frequentSegments = new Set<string>();
  const frequentGroupsNorm = new Set<string>();
  for (const e of frequentOrdered) {
    if (e.groupTitle) {
      frequentGroupsNorm.add(normalizeToken(e.groupTitle));
      for (const s of segmentizeGroupTitle(e.groupTitle)) {
        frequentSegments.add(s);
      }
    }
  }

  const currentGroupNorm = options.currentGroupTitle
    ? normalizeToken(options.currentGroupTitle)
    : "";
  const currentSegments = segmentizeGroupTitle(
    options.currentGroupTitle ?? undefined,
  );

  const ctx = {
    frequentSegments,
    frequentGroupsNorm,
    currentSegments,
    currentGroupNorm,
  };

  type Scored = { ch: M3uChannel; score: number; jitter: number };
  const scored: Scored[] = [];

  for (const ch of catalog) {
    if (seen.has(ch.url)) continue;
    scored.push({
      ch,
      score: scoreCatalogChannel(ch, ctx),
      jitter: Math.random(),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.jitter - a.jitter;
  });

  let remaining = needed;
  for (const row of scored) {
    if (seen.has(row.ch.url)) continue;
    seen.add(row.ch.url);
    out.push(m3uChannelToRingEntry(row.ch));
    remaining--;
    if (remaining <= 0) break;
  }

  return out;
}
