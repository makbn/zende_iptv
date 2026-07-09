import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { getTmdbApiKey, tmdbApiBase, tmdbPosterUrl } from "@/lib/tmdb/tmdb-config";
import type { TmdbMediaMatch } from "@/lib/tmdb/types";

const log = createServerLogger("lib.tmdb.client");

type TmdbMultiResult = {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

type TmdbSearchResponse = {
  results?: TmdbMultiResult[];
};

function yearFromDate(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const year = value.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : undefined;
}

function mapResult(item: TmdbMultiResult): TmdbMediaMatch | null {
  if (!item.id || (item.media_type !== "movie" && item.media_type !== "tv")) {
    return null;
  }
  const title =
    item.media_type === "movie"
      ? item.title?.trim() || item.original_title?.trim()
      : item.name?.trim() || item.original_name?.trim();
  if (!title) return null;

  const year =
    item.media_type === "movie"
      ? yearFromDate(item.release_date)
      : yearFromDate(item.first_air_date);

  return {
    id: String(item.id),
    tmdbId: String(item.id),
    mediaType: item.media_type,
    title,
    year,
    overview: item.overview?.trim() || undefined,
    posterUrl: tmdbPosterUrl(item.poster_path),
  };
}

async function searchEndpoint(
  endpoint: "multi" | "movie" | "tv",
  query: string,
  apiKey: string,
): Promise<TmdbMediaMatch[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query: query.trim(),
    include_adult: "false",
    language: "en-US",
  });
  const url = `${tmdbApiBase()}/search/${endpoint}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as TmdbSearchResponse & {
    status_message?: string;
  };

  if (!res.ok) {
    log.warn("TMDB search failed", { endpoint, status: res.status, query });
    throw new Error(
      typeof body.status_message === "string"
        ? body.status_message
        : `TMDB search failed (${res.status}).`,
    );
  }

  const items = Array.isArray(body.results) ? body.results : [];
  return items
    .map(mapResult)
    .filter((item): item is TmdbMediaMatch => item != null);
}

export async function searchTmdbMedia(
  query: string,
  opts?: { preferType?: "movie" | "tv" | "any" },
): Promise<TmdbMediaMatch[]> {
  const apiKey = await getTmdbApiKey();
  if (!apiKey) {
    throw new Error("TMDB API key is not configured.");
  }

  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Enter a movie or show title to search.");
  }

  const preferType = opts?.preferType ?? "any";
  if (preferType === "movie") {
    return searchEndpoint("movie", trimmed, apiKey);
  }
  if (preferType === "tv") {
    return searchEndpoint("tv", trimmed, apiKey);
  }

  const [multi, movies, tv] = await Promise.all([
    searchEndpoint("multi", trimmed, apiKey),
    searchEndpoint("movie", trimmed, apiKey),
    searchEndpoint("tv", trimmed, apiKey),
  ]);

  const seen = new Set<string>();
  const merged: TmdbMediaMatch[] = [];
  for (const item of [...multi, ...movies, ...tv]) {
    const key = `${item.mediaType}:${item.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(0, 20);
}
