import "server-only";

import { createServerLogger } from "@/core/logging/server";
import {
  getTmdbApiKey,
  tmdbApiBase,
  tmdbImageUrl,
  tmdbPosterUrl,
} from "@/lib/tmdb/tmdb-config";
import type { MediaCastMember } from "@/lib/media/media-metadata";
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

function mapResult(
  item: TmdbMultiResult,
  assumedType?: "movie" | "tv",
): TmdbMediaMatch | null {
  const mediaType =
    item.media_type === "movie" || item.media_type === "tv"
      ? item.media_type
      : assumedType;
  if (!item.id || !mediaType) {
    return null;
  }
  const title =
    mediaType === "movie"
      ? item.title?.trim() || item.original_title?.trim()
      : item.name?.trim() || item.original_name?.trim();
  if (!title) return null;

  const year =
    mediaType === "movie"
      ? yearFromDate(item.release_date)
      : yearFromDate(item.first_air_date);

  return {
    id: String(item.id),
    tmdbId: String(item.id),
    mediaType,
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
    .map((item) => mapResult(item, endpoint === "multi" ? undefined : endpoint))
    .filter((item): item is TmdbMediaMatch => item != null);
}

type TmdbDetailsResponse = {
  id?: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  tagline?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  vote_average?: number;
  vote_count?: number;
  genres?: Array<{ id?: number; name?: string }>;
  credits?: {
    cast?: Array<{
      id?: number;
      name?: string;
      character?: string;
      profile_path?: string | null;
      order?: number;
    }>;
  };
  external_ids?: { imdb_id?: string | null };
  content_ratings?: {
    results?: Array<{ iso_3166_1?: string; rating?: string }>;
  };
  release_dates?: {
    results?: Array<{
      iso_3166_1?: string;
      release_dates?: Array<{ certification?: string }>;
    }>;
  };
};

export type TmdbMediaDetails = {
  tmdbId: string;
  imdbId?: string;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle?: string;
  tagline?: string;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseDate?: string;
  year?: string;
  runtimeMinutes?: number;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  status?: string;
  contentRating?: string;
  voteAverage?: number;
  voteCount?: number;
  genres: string[];
  cast: MediaCastMember[];
};

function preferredRegion<T extends { iso_3166_1?: string }>(rows: T[]): T | undefined {
  return (
    rows.find((row) => row.iso_3166_1 === "US") ??
    rows.find((row) => row.iso_3166_1 === "CA") ??
    rows.find((row) => row.iso_3166_1 === "GB") ??
    rows[0]
  );
}

function contentRating(body: TmdbDetailsResponse, mediaType: "movie" | "tv"): string | undefined {
  if (mediaType === "tv") {
    return preferredRegion(body.content_ratings?.results ?? [])?.rating?.trim() || undefined;
  }
  const regions = body.release_dates?.results ?? [];
  const preferred = preferredRegion(regions);
  const fromPreferred = preferred?.release_dates?.find((row) => row.certification?.trim())
    ?.certification;
  if (fromPreferred?.trim()) return fromPreferred.trim();
  for (const region of regions) {
    const found = region.release_dates?.find((row) => row.certification?.trim())?.certification;
    if (found?.trim()) return found.trim();
  }
  return undefined;
}

/** One TMDB request for title details, credits, external IDs and ratings. */
export async function fetchTmdbMediaDetails(
  tmdbId: string,
  mediaType: "movie" | "tv",
): Promise<TmdbMediaDetails> {
  const apiKey = await getTmdbApiKey();
  if (!apiKey) throw new Error("TMDB API key is not configured.");
  if (!/^\d+$/.test(tmdbId.trim())) throw new Error("Invalid TMDB ID.");

  const appended =
    mediaType === "movie"
      ? "credits,external_ids,release_dates"
      : "credits,external_ids,content_ratings";
  const params = new URLSearchParams({
    api_key: apiKey,
    language: "en-US",
    append_to_response: appended,
  });
  const url = `${tmdbApiBase()}/${mediaType}/${encodeURIComponent(tmdbId)}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as TmdbDetailsResponse & {
    status_message?: string;
  };
  if (!res.ok) {
    log.warn("TMDB details failed", { mediaType, tmdbId, status: res.status });
    throw new Error(
      body.status_message?.trim() || `TMDB details failed (${res.status}).`,
    );
  }

  const title =
    mediaType === "movie"
      ? body.title?.trim() || body.original_title?.trim()
      : body.name?.trim() || body.original_name?.trim();
  if (!title) throw new Error("TMDB returned details without a title.");
  const releaseDate =
    (mediaType === "movie" ? body.release_date : body.first_air_date)?.trim() || undefined;
  const runtime =
    mediaType === "movie"
      ? body.runtime
      : body.episode_run_time?.find((value) => Number.isFinite(value) && value > 0);
  const cast = (body.credits?.cast ?? [])
    .filter((person) => person.name?.trim())
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 18)
    .map((person) => ({
      ...(person.id ? { id: String(person.id) } : {}),
      name: person.name!.trim(),
      ...(person.character?.trim() ? { character: person.character.trim() } : {}),
      ...(tmdbImageUrl(person.profile_path, "w185")
        ? { profileUrl: tmdbImageUrl(person.profile_path, "w185")! }
        : {}),
    }));

  return {
    tmdbId: String(body.id ?? tmdbId),
    ...(body.external_ids?.imdb_id?.trim()
      ? { imdbId: body.external_ids.imdb_id.trim() }
      : {}),
    mediaType,
    title,
    ...((mediaType === "movie" ? body.original_title : body.original_name)?.trim()
      ? { originalTitle: (mediaType === "movie" ? body.original_title : body.original_name)!.trim() }
      : {}),
    ...(body.tagline?.trim() ? { tagline: body.tagline.trim() } : {}),
    ...(body.overview?.trim() ? { overview: body.overview.trim() } : {}),
    ...(tmdbImageUrl(body.poster_path, "w500")
      ? { posterUrl: tmdbImageUrl(body.poster_path, "w500")! }
      : {}),
    ...(tmdbImageUrl(body.backdrop_path, "original")
      ? { backdropUrl: tmdbImageUrl(body.backdrop_path, "original")! }
      : {}),
    ...(releaseDate ? { releaseDate, year: yearFromDate(releaseDate) } : {}),
    ...(runtime && runtime > 0 ? { runtimeMinutes: Math.round(runtime) } : {}),
    ...(body.number_of_seasons && body.number_of_seasons > 0
      ? { numberOfSeasons: body.number_of_seasons }
      : {}),
    ...(body.number_of_episodes && body.number_of_episodes > 0
      ? { numberOfEpisodes: body.number_of_episodes }
      : {}),
    ...(body.status?.trim() ? { status: body.status.trim() } : {}),
    ...(contentRating(body, mediaType)
      ? { contentRating: contentRating(body, mediaType)! }
      : {}),
    ...(typeof body.vote_average === "number" && body.vote_average > 0
      ? { voteAverage: body.vote_average }
      : {}),
    ...(typeof body.vote_count === "number" && body.vote_count > 0
      ? { voteCount: body.vote_count }
      : {}),
    genres: (body.genres ?? [])
      .map((genre) => genre.name?.trim())
      .filter((name): name is string => Boolean(name)),
    cast,
  };
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
