import "server-only";

import { isBuiltinPresetId } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType, type LibraryContentType } from "@/lib/channels/content-type";
import { loadManualChannelRows } from "@/lib/channels/manual-channels-db";
import { normalizeManualChannel } from "@/lib/channels/manual-channels-policy";
import { mergeBuiltinAndManual } from "@/lib/channels/merge-catalog";
import { prisma } from "@/lib/db/prisma";

export type LibraryCatalogQuery = {
  presetId: string;
  contentType: "all" | LibraryContentType;
  q?: string;
  group?: string | null;
  language?: string | null;
  offset: number;
  limit: number;
};

export type LibraryCatalogFacets = {
  groups: Array<{ name: string; count: number }>;
  languages: Array<{ key: string; label: string; count: number }>;
};

export type LibraryCatalogResult = {
  channels: M3uChannel[];
  total: number;
  offset: number;
  limit: number;
  facets: LibraryCatalogFacets;
};

async function loadBuiltinChannels(presetId: string): Promise<M3uChannel[]> {
  if (!isBuiltinPresetId(presetId)) return [];
  const row = await prisma.playlistCatalogCache.findUnique({ where: { presetId } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.channelsJson) as M3uChannel[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadMergedLibraryCatalog(presetId: string): Promise<M3uChannel[]> {
  const [builtin, manualRows] = await Promise.all([
    loadBuiltinChannels(presetId),
    loadManualChannelRows(),
  ]);
  const manual = manualRows.map((row) => normalizeManualChannel(row.channel));
  return mergeBuiltinAndManual(builtin, manual);
}

const MERGED_CACHE_TTL_MS = 45_000;
let mergedCache: { presetId: string; at: number; channels: M3uChannel[] } | null = null;

/** Drop cached rows after catalog import / manual channel edits (server process). */
export function invalidateLibraryCatalogCache(): void {
  mergedCache = null;
}

async function loadMergedLibraryCatalogCached(presetId: string): Promise<M3uChannel[]> {
  const now = Date.now();
  if (
    mergedCache &&
    mergedCache.presetId === presetId &&
    now - mergedCache.at < MERGED_CACHE_TTL_MS
  ) {
    return mergedCache.channels;
  }
  const channels = await loadMergedLibraryCatalog(presetId);
  mergedCache = { presetId, at: now, channels };
  return channels;
}

function matchesQuery(channel: M3uChannel, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (channel.name.toLowerCase().includes(needle)) return true;
  const group = channel.groupTitle ?? "";
  if (group.toLowerCase().includes(needle)) return true;
  const lang = channel.tvgLanguage ?? "";
  if (lang.toLowerCase().includes(needle)) return true;
  const tvgId = channel.tvgId ?? "";
  if (tvgId.toLowerCase().includes(needle)) return true;
  return false;
}

function buildFacets(channels: M3uChannel[]): LibraryCatalogFacets {
  const groupCounts = new Map<string, number>();
  const langCounts = new Map<string, { label: string; count: number }>();

  for (const channel of channels) {
    const group = channel.groupTitle?.trim() || "Other";
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);

    const rawLang = channel.tvgLanguage?.trim();
    if (!rawLang) continue;
    const key = rawLang.toLowerCase();
    const prev = langCounts.get(key);
    if (prev) prev.count += 1;
    else langCounts.set(key, { label: rawLang, count: 1 });
  }

  const groups = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 36)
    .map(([name, count]) => ({ name, count }));

  const languages = [...langCounts.entries()]
    .sort(
      (a, b) =>
        b[1].count - a[1].count ||
        a[1].label.localeCompare(b[1].label, undefined, { sensitivity: "base" }),
    )
    .slice(0, 32)
    .map(([key, value]) => ({ key, label: value.label, count: value.count }));

  return { groups, languages };
}

export async function queryLibraryCatalog(
  query: LibraryCatalogQuery,
): Promise<LibraryCatalogResult> {
  const merged = await loadMergedLibraryCatalogCached(query.presetId);

  let scoped = merged.filter((channel) => {
    const type = resolveLibraryContentType(channel);
    if (query.contentType !== "all" && type !== query.contentType) return false;
    return true;
  });

  const facets = buildFacets(scoped);

  if (query.group) {
    scoped = scoped.filter(
      (channel) => (channel.groupTitle?.trim() || "Other") === query.group,
    );
  }
  if (query.language) {
    scoped = scoped.filter(
      (channel) =>
        (channel.tvgLanguage?.trim().toLowerCase() ?? "") === query.language,
    );
  }
  if (query.q) {
    scoped = scoped.filter((channel) => matchesQuery(channel, query.q!));
  }

  const total = scoped.length;
  const channels = scoped.slice(query.offset, query.offset + query.limit);

  return {
    channels,
    total,
    offset: query.offset,
    limit: query.limit,
    facets,
  };
}
