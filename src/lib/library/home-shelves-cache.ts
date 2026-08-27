import "server-only";

import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { prisma } from "@/lib/db/prisma";
import { queryHomeCatalogShelves, type HomeCatalogShelves } from "@/lib/library/catalog";
import { filterParentalChannels } from "@/lib/parental/parental-control-store";

const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const SNAPSHOT_DISCOVER_LIMIT = 120;
const SNAPSHOT_MOVIE_LIMIT = 60;
const SNAPSHOT_SERIES_LIMIT = 60;
const DEFAULT_LANGUAGE = "en";

let rebuildPromise: Promise<HomeCatalogShelves> | null = null;

function cacheId(presetId: string, language: string | null): string {
  return `${presetId}:${language ?? "all"}`;
}

function parseSnapshot(value: string): HomeCatalogShelves | null {
  try {
    const parsed = JSON.parse(value) as HomeCatalogShelves;
    if (!parsed?.discover?.channels || !parsed?.movies?.channels || !parsed?.series?.channels) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function rebuildSnapshot(presetId: string, language: string | null): Promise<HomeCatalogShelves> {
  if (!rebuildPromise) {
    rebuildPromise = queryHomeCatalogShelves({
      presetId,
      language,
      discoverLimit: SNAPSHOT_DISCOVER_LIMIT,
      movieLimit: SNAPSHOT_MOVIE_LIMIT,
      seriesLimit: SNAPSHOT_SERIES_LIMIT,
    }).then(async (data) => {
      await prisma.homeShelvesCache.upsert({
        where: { id: cacheId(presetId, language) },
        create: { id: cacheId(presetId, language), dataJson: JSON.stringify(data), builtAt: new Date() },
        update: { dataJson: JSON.stringify(data), builtAt: new Date() },
      });
      return data;
    }).finally(() => {
      rebuildPromise = null;
    });
  }
  return rebuildPromise;
}

function prepareResponse(
  snapshot: HomeCatalogShelves,
  hiddenPatterns: string[],
  limits: { discoverLimit: number; movieLimit: number; seriesLimit: number },
): HomeCatalogShelves {
  const shelf = (channels: M3uChannel[], total: number, limit: number) => {
    const visible = filterParentalChannels(channels, hiddenPatterns);
    return { channels: visible.slice(0, limit), total: hiddenPatterns.length ? visible.length : total };
  };
  return {
    discover: shelf(snapshot.discover.channels, snapshot.discover.total, limits.discoverLimit),
    movies: shelf(snapshot.movies.channels, snapshot.movies.total, limits.movieLimit),
    series: shelf(snapshot.series.channels, snapshot.series.total, limits.seriesLimit),
  };
}

export async function getCachedHomeShelves(input: {
  presetId: string;
  language?: string | null;
  hiddenPatterns?: string[];
  discoverLimit: number;
  movieLimit: number;
  seriesLimit: number;
}): Promise<HomeCatalogShelves> {
  const language = input.language?.trim().toLowerCase() || null;
  const row = await prisma.homeShelvesCache.findUnique({ where: { id: cacheId(input.presetId, language) } });
  const snapshot = row ? parseSnapshot(row.dataJson) : null;
  if (snapshot) {
    if (Date.now() - row!.builtAt.getTime() >= SNAPSHOT_TTL_MS) {
      void rebuildSnapshot(input.presetId, language).catch(() => {});
    }
    return prepareResponse(snapshot, input.hiddenPatterns ?? [], input);
  }
  const fresh = await rebuildSnapshot(input.presetId, language);
  return prepareResponse(fresh, input.hiddenPatterns ?? [], input);
}

export async function warmDefaultHomeShelvesIfNeeded(): Promise<void> {
  const presetId = BUILTIN_PLAYLIST_SOURCES[0]!.presetId;
  const id = cacheId(presetId, DEFAULT_LANGUAGE);
  const row = await prisma.homeShelvesCache.findUnique({ where: { id }, select: { builtAt: true } });
  if (row && Date.now() - row.builtAt.getTime() < SNAPSHOT_TTL_MS) return;
  await rebuildSnapshot(presetId, DEFAULT_LANGUAGE);
}
