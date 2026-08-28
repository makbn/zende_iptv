export const MEDIA_METADATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export type MediaCastMember = {
  id?: string;
  name: string;
  character?: string;
  profileUrl?: string;
};

export type MediaScore = {
  source: "TMDB" | "Provider";
  value: number;
  max: number;
  votes?: number;
};

export type MediaMetadata = {
  mediaType: "movie" | "tv";
  source: "tmdb" | "portal";
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
  tmdbId?: string;
  imdbId?: string;
  genres: string[];
  scores: MediaScore[];
  cast: MediaCastMember[];
  fetchedAt: string;
};

export function parseMediaMetadataPayload(payloadJson: string): MediaMetadata | null {
  try {
    const value = JSON.parse(payloadJson) as MediaMetadata;
    if (!value || (value.mediaType !== "movie" && value.mediaType !== "tv")) return null;
    if (typeof value.title !== "string" || !value.title.trim()) return null;
    return {
      ...value,
      genres: Array.isArray(value.genres) ? value.genres : [],
      scores: Array.isArray(value.scores) ? value.scores : [],
      cast: Array.isArray(value.cast) ? value.cast : [],
    };
  } catch {
    return null;
  }
}
