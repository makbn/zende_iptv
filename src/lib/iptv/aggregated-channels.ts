import "server-only";

import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { prisma } from "@/lib/db/prisma";

const MANUAL_STORE_ID = 1;
const CACHE_TTL_MS = 15_000;

export type XtreamCategory = {
  category_id: string;
  category_name: string;
  parent_id: number;
};

export type AggregatedStreamRow = {
  streamId: number;
  channel: M3uChannel;
  categoryId: string;
};

export type AggregatedXtreamCatalog = {
  categories: XtreamCategory[];
  streams: AggregatedStreamRow[];
};

type CacheSlot = { t: number; data: AggregatedXtreamCatalog };
let cache: CacheSlot | null = null;

/** Call after catalog or manual channel updates so IPTV clients see fresh lineups immediately. */
export function invalidateXtreamCatalogCache(): void {
  cache = null;
}

async function loadManualChannels(): Promise<M3uChannel[]> {
  const row = await prisma.manualChannelsStore.findUnique({
    where: { id: MANUAL_STORE_ID },
  });
  if (!row) return [];

  try {
    const parsed = JSON.parse(row.entriesJson) as unknown;
    if (!Array.isArray(parsed)) return [];

    const out: M3uChannel[] = [];
    for (const item of parsed) {
      const ch =
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).channel &&
        typeof (item as Record<string, unknown>).channel === "object"
          ? ((item as Record<string, unknown>).channel as M3uChannel)
          : null;
      if (ch?.name && typeof ch.url === "string") out.push(ch);
    }
    return out;
  } catch {
    return [];
  }
}

/** Live channels Xtream/TiviMate should see: cached built-in playlists + Settings → manual URLs. */
export async function getAggregatedXtreamCatalog(): Promise<AggregatedXtreamCatalog> {
  if (cache && Date.now() - cache.t < CACHE_TTL_MS) {
    return cache.data;
  }

  const fromPresets: M3uChannel[] = [];
  for (const src of BUILTIN_PLAYLIST_SOURCES) {
    const row = await prisma.playlistCatalogCache.findUnique({
      where: { presetId: src.presetId },
    });
    if (!row) continue;

    try {
      const parsed = JSON.parse(row.channelsJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const ch of parsed as M3uChannel[]) {
          if (ch?.name && typeof ch.url === "string") fromPresets.push(ch);
        }
      }
    } catch {
      /* skip corrupt row */
    }
  }

  const manual = await loadManualChannels();
  const flat: M3uChannel[] = [...fromPresets, ...manual];

  const groupNames = new Set<string>();
  for (const ch of flat) {
    const g = (ch.groupTitle ?? "").trim() || "Uncategorized";
    groupNames.add(g);
  }

  const sortedGroups = [...groupNames].sort((a, b) =>
    a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b),
  );

  const groupToCatId = new Map<string, string>();
  sortedGroups.forEach((name, idx) => {
    groupToCatId.set(name, String(idx + 1));
  });

  const categories: XtreamCategory[] = sortedGroups.map((name, idx) => ({
    category_id: String(idx + 1),
    category_name: name,
    parent_id: 0,
  }));

  const streams: AggregatedStreamRow[] = flat.map((channel, idx) => {
    const g = (channel.groupTitle ?? "").trim() || "Uncategorized";
    const categoryId = groupToCatId.get(g) ?? "1";
    return {
      streamId: idx + 1,
      channel,
      categoryId,
    };
  });

  const data = { categories, streams };
  cache = { t: Date.now(), data };
  return data;
}
