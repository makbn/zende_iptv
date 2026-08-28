import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { prisma } from "@/lib/db/prisma";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import {
  MEDIA_METADATA_MAX_AGE_MS,
  parseMediaMetadataPayload,
  type MediaMetadata,
  type MediaScore,
} from "@/lib/media/media-metadata";
import { parseXtreamDurationSeconds } from "@/lib/playback/stream-session-meta";
import {
  fetchTmdbMediaDetails,
  searchTmdbMedia,
  type TmdbMediaDetails,
} from "@/lib/tmdb/tmdb-client";
import type { TmdbMediaMatch } from "@/lib/tmdb/types";

const log = createServerLogger("lib.media.metadata");
const inflight = new Map<string, Promise<MediaMetadata | null>>();

export type MediaMetadataInput = {
  mediaKey: string;
  providerChannelId?: string | null;
  mediaType: "movie" | "tv";
  title: string;
  year?: string | null;
  portalInfo?: Record<string, unknown> | null;
};

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function firstText(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    const direct = text(value);
    if (direct) return direct;
    if (Array.isArray(value)) {
      const first = value.map(text).find(Boolean);
      if (first) return first;
    }
  }
  return undefined;
}

function listFromValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(text).filter((item): item is string => Boolean(item));
  }
  const raw = text(value);
  if (!raw) return [];
  return raw
    .split(/[,|/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function yearFromPortal(info: Record<string, unknown>, fallback?: string | null): string | undefined {
  const raw = firstText(info, ["year", "release_date", "releasedate", "first_air_date"]);
  const match = raw?.match(/\b(19|20)\d{2}\b/)?.[0];
  return match ?? (fallback && /^\d{4}$/.test(fallback) ? fallback : undefined);
}

function tmdbIdFromPortal(info: Record<string, unknown>): string | undefined {
  const raw = firstText(info, ["tmdb_id", "tmdb", "tmdbId"]);
  return raw?.match(/\d+/)?.[0];
}

function imdbIdFromPortal(info: Record<string, unknown>): string | undefined {
  const raw = firstText(info, ["imdb_id", "imdb", "imdbId"]);
  return raw?.match(/tt\d+/i)?.[0];
}

function portalMetadata(input: MediaMetadataInput, fetchedAt: Date): MediaMetadata {
  const info = input.portalInfo ?? {};
  const parsedTitle = parseChannelLabel(input.title);
  const title =
    firstText(info, ["name", "title", "o_name", "original_name"]) ??
    parsedTitle.displayName;
  const runtimeSeconds = parseXtreamDurationSeconds(info);
  const rating = positiveNumber(info.rating);
  const rating5 = positiveNumber(info.rating_5based);
  const scores: MediaScore[] = [];
  if (rating) scores.push({ source: "Provider", value: rating, max: rating > 10 ? 100 : 10 });
  else if (rating5) scores.push({ source: "Provider", value: rating5, max: 5 });
  const castNames = listFromValue(info.cast).slice(0, 18);

  return {
    mediaType: input.mediaType,
    source: "portal",
    title,
    ...(firstText(info, ["original_name", "original_title", "o_name"])
      ? { originalTitle: firstText(info, ["original_name", "original_title", "o_name"])! }
      : {}),
    ...(firstText(info, ["tagline"]) ? { tagline: firstText(info, ["tagline"])! } : {}),
    ...(firstText(info, ["plot", "overview", "description"])
      ? { overview: firstText(info, ["plot", "overview", "description"])! }
      : {}),
    ...(firstText(info, ["movie_image", "cover_big", "cover"])
      ? { posterUrl: firstText(info, ["movie_image", "cover_big", "cover"])! }
      : {}),
    ...(firstText(info, ["backdrop_path", "backdrop", "backdrop_url"])
      ? { backdropUrl: firstText(info, ["backdrop_path", "backdrop", "backdrop_url"])! }
      : {}),
    ...(firstText(info, ["release_date", "releasedate", "first_air_date"])
      ? { releaseDate: firstText(info, ["release_date", "releasedate", "first_air_date"])! }
      : {}),
    ...(yearFromPortal(info, input.year) ? { year: yearFromPortal(info, input.year)! } : {}),
    ...(runtimeSeconds ? { runtimeMinutes: Math.max(1, Math.round(runtimeSeconds / 60)) } : {}),
    ...(firstText(info, ["status"]) ? { status: firstText(info, ["status"])! } : {}),
    ...(firstText(info, ["age", "certification", "mpaa_rating"])
      ? { contentRating: firstText(info, ["age", "certification", "mpaa_rating"])! }
      : {}),
    ...(tmdbIdFromPortal(info) ? { tmdbId: tmdbIdFromPortal(info)! } : {}),
    ...(imdbIdFromPortal(info) ? { imdbId: imdbIdFromPortal(info)! } : {}),
    genres: listFromValue(info.genre ?? info.genres),
    scores,
    cast: castNames.map((name) => ({ name })),
    fetchedAt: fetchedAt.toISOString(),
  };
}

function normalizedTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function selectBestTmdbMatch(
  matches: TmdbMediaMatch[],
  title: string,
  year?: string,
): TmdbMediaMatch | null {
  if (matches.length === 0) return null;
  const wanted = normalizedTitle(title);
  const exactTitle = matches.filter((match) => normalizedTitle(match.title) === wanted);
  const pool = exactTitle.length > 0 ? exactTitle : matches;
  if (year) {
    const exactYear = pool.find((match) => match.year === year);
    if (exactYear) return exactYear;
  }
  return pool[0] ?? null;
}

function mergeTmdb(portal: MediaMetadata, tmdb: TmdbMediaDetails, fetchedAt: Date): MediaMetadata {
  const scores: MediaScore[] = [];
  if (tmdb.voteAverage) {
    scores.push({
      source: "TMDB",
      value: tmdb.voteAverage,
      max: 10,
      ...(tmdb.voteCount ? { votes: tmdb.voteCount } : {}),
    });
  }
  scores.push(...portal.scores.filter((score) => score.source !== "TMDB"));
  return {
    ...portal,
    ...tmdb,
    source: "tmdb",
    overview: tmdb.overview || portal.overview,
    posterUrl: tmdb.posterUrl || portal.posterUrl,
    backdropUrl: tmdb.backdropUrl || portal.backdropUrl,
    releaseDate: tmdb.releaseDate || portal.releaseDate,
    year: tmdb.year || portal.year,
    runtimeMinutes: tmdb.runtimeMinutes || portal.runtimeMinutes,
    contentRating: tmdb.contentRating || portal.contentRating,
    genres: tmdb.genres.length > 0 ? tmdb.genres : portal.genres,
    scores,
    cast: tmdb.cast.length > 0 ? tmdb.cast : portal.cast,
    fetchedAt: fetchedAt.toISOString(),
  };
}

async function refreshMetadata(input: MediaMetadataInput): Promise<MediaMetadata | null> {
  const cached = await prisma.mediaMetadataCache.findUnique({ where: { mediaKey: input.mediaKey } });
  const cachedPayload = cached ? parseMediaMetadataPayload(cached.payloadJson) : null;
  if (cached && cachedPayload && Date.now() - cached.fetchedAt.getTime() < MEDIA_METADATA_MAX_AGE_MS) {
    return cachedPayload;
  }

  const fetchedAt = new Date();
  const portal = portalMetadata(input, fetchedAt);
  let metadata = portal;
  try {
    let tmdbId = portal.tmdbId;
    if (!tmdbId) {
      const matches = await searchTmdbMedia(portal.title, {
        preferType: input.mediaType,
      });
      tmdbId = selectBestTmdbMatch(matches, portal.title, portal.year)?.tmdbId;
    }
    if (tmdbId) {
      const details = await fetchTmdbMediaDetails(tmdbId, input.mediaType);
      metadata = mergeTmdb(portal, details, fetchedAt);
    }
  } catch (error) {
    log.warn("public metadata refresh failed", {
      mediaKey: input.mediaKey,
      mediaType: input.mediaType,
      error: error instanceof Error ? error.message : String(error),
    });
    if (cachedPayload) return cachedPayload;
  }

  await prisma.mediaMetadataCache.upsert({
    where: { mediaKey: input.mediaKey },
    create: {
      mediaKey: input.mediaKey,
      providerChannelId: input.providerChannelId ?? null,
      mediaType: input.mediaType,
      title: metadata.title,
      tmdbId: metadata.tmdbId ?? null,
      imdbId: metadata.imdbId ?? null,
      payloadJson: JSON.stringify(metadata),
      fetchedAt,
    },
    update: {
      ...(input.providerChannelId ? { providerChannelId: input.providerChannelId } : {}),
      mediaType: input.mediaType,
      title: metadata.title,
      tmdbId: metadata.tmdbId ?? null,
      imdbId: metadata.imdbId ?? null,
      payloadJson: JSON.stringify(metadata),
      fetchedAt,
    },
  });
  return metadata;
}

/** Read-through database cache with a seven-day refresh window and request de-duplication. */
export function getCachedMediaMetadata(input: MediaMetadataInput): Promise<MediaMetadata | null> {
  const existing = inflight.get(input.mediaKey);
  if (existing) return existing;
  const pending = refreshMetadata(input).finally(() => inflight.delete(input.mediaKey));
  inflight.set(input.mediaKey, pending);
  return pending;
}
