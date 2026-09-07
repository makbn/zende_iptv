import "server-only";

import { createHash } from "node:crypto";

import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { prisma } from "@/lib/db/prisma";
import { queryHomeCatalogShelves, type HomeCatalogShelves } from "@/lib/library/catalog";
import { primeRemoteImageCache } from "@/lib/media/image-relay";
import { getCachedMediaMetadata } from "@/lib/media/media-metadata-service";
import { filterParentalChannels } from "@/lib/parental/parental-control-store";

const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const SNAPSHOT_DISCOVER_LIMIT = 120;
const SNAPSHOT_MOVIE_LIMIT = 60;
const SNAPSHOT_SERIES_LIMIT = 60;
const DEFAULT_LANGUAGE = "en";
const PRELOAD_LIMIT_PER_MEDIA_TYPE = 24;
const PRELOAD_CONCURRENCY = 6;

let rebuildPromise: Promise<HomeCatalogShelves> | null = null;

function cacheId(presetId: string, language: string | null): string {
  // v2 snapshots contain complete hero metadata and already-downloaded artwork.
  return `v2:${presetId}:${language ?? "all"}`;
}

function cleanMediaTitle(raw: string): { title: string; year?: string } {
  const clean = raw
    .replace(/^\s*(?:[\u{1F1E6}-\u{1F1FF}]{2}\s*)+/u, "")
    .replace(/^\s*\[[A-Z]{2,3}\]\s*/i, "")
    .replace(/^\s*[A-Z]{2,4}\s*[:|·-]\s*/i, "")
    .replace(/\s*(?:[-–—|]\s*)?S\d{1,2}E\d{1,3}\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = parseChannelLabel(clean || raw);
  const looseYear = clean.match(/\b(19|20)\d{2}\s*$/)?.[0];
  const title = parsed.displayName.replace(/\s+(?:19|20)\d{2}\s*$/i, "").trim();
  return {
    title: title || parsed.displayName,
    ...((parsed.yearLabel || looseYear) ? { year: parsed.yearLabel || looseYear } : {}),
  };
}

function mediaKey(channel: M3uChannel, mediaType: "movie" | "tv", title: string, year?: string): string {
  if (channel.providerChannelId) return `channel:${channel.providerChannelId}`;
  const identity = `${mediaType}\0${title.toLowerCase()}\0${year ?? ""}`;
  return `home:${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

async function enrichHomeChannels(
  channels: M3uChannel[],
  mediaType: "movie" | "tv",
): Promise<M3uChannel[]> {
  const enriched = channels.slice();
  const count = Math.min(enriched.length, PRELOAD_LIMIT_PER_MEDIA_TYPE);
  let cursor = 0;

  const worker = async () => {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      const channel = enriched[index]!;
      const { title, year } = cleanMediaTitle(channel.name);
      try {
        const metadata = await getCachedMediaMetadata({
          mediaKey: mediaKey(channel, mediaType, title, year),
          providerChannelId: channel.providerChannelId,
          mediaType,
          title,
          year,
        });
        if (!metadata) continue;
        await Promise.all([
          primeRemoteImageCache("poster", metadata.backdropUrl),
          primeRemoteImageCache("poster", metadata.posterUrl),
        ]);
        enriched[index] = { ...channel, homeMetadata: metadata };
      } catch {
        // A single unmatched title must not prevent the Home snapshot from publishing.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PRELOAD_CONCURRENCY, count) }, () => worker()),
  );
  return enriched;
}

async function enrichSnapshot(data: HomeCatalogShelves): Promise<HomeCatalogShelves> {
  const [movies, series] = await Promise.all([
    enrichHomeChannels(data.movies.channels, "movie"),
    enrichHomeChannels(data.series.channels, "tv"),
  ]);
  return {
    ...data,
    movies: { ...data.movies, channels: movies },
    series: { ...data.series, channels: series },
  };
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
    }).then(enrichSnapshot).then(async (data) => {
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
