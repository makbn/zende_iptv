import type { MediaMetadata, MediaScore } from "@/lib/media/media-metadata";

export type ImdbRatingRow = {
  imdbId: string;
  rating: number;
  votes: number;
};

export type ImdbTitleBasicsRow = {
  imdbId: string;
  titleType: string;
  primaryTitle: string;
  originalTitle: string;
  isAdult: boolean;
  year: string | null;
};

export function parseImdbRatingRow(line: string): ImdbRatingRow | null {
  const [imdbId, rawRating, rawVotes] = line.trim().split("\t");
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return null;
  const rating = Number(rawRating);
  const votes = Number(rawVotes);
  if (!Number.isFinite(rating) || rating <= 0 || rating > 10) return null;
  if (!Number.isSafeInteger(votes) || votes < 0) return null;
  return { imdbId, rating, votes };
}

export function parseImdbTitleBasicsRow(line: string): ImdbTitleBasicsRow | null {
  const [imdbId, titleType, primaryTitle, originalTitle, rawAdult, rawYear] = line.trim().split("\t");
  if (!imdbId || !/^tt\d+$/.test(imdbId) || !titleType || !primaryTitle || !originalTitle) {
    return null;
  }
  if (rawAdult !== "0" && rawAdult !== "1") return null;
  return {
    imdbId,
    titleType,
    primaryTitle,
    originalTitle,
    isAdult: rawAdult === "1",
    year: rawYear && /^\d{4}$/.test(rawYear) ? rawYear : null,
  };
}

export function normalizeImdbLookupTitle(value: string): string {
  return value
    .replace(/^\s*(?:[a-z]{2,3}|multi(?:-lang)?)\s*[|:]\s*/i, "")
    .replace(/\[[^\]]+\]/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:2160p|1080p|720p|4k|uhd|fhd|hd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function imdbTitleTypeMatchesMedia(
  titleType: string,
  mediaType: "movie" | "tv",
): boolean {
  if (mediaType === "movie") {
    return ["movie", "short", "tvMovie", "tvSpecial", "video"].includes(titleType);
  }
  return ["tvSeries", "tvMiniSeries", "tvShort"].includes(titleType);
}

export function withImdbRating(
  metadata: MediaMetadata,
  rating: number,
  votes: number,
): MediaMetadata {
  const imdbScore: MediaScore = {
    source: "IMDb",
    value: rating,
    max: 10,
    votes,
  };
  return {
    ...metadata,
    scores: [imdbScore, ...metadata.scores.filter((score) => score.source !== "IMDb")],
  };
}

export function preserveImdbRating(
  metadata: MediaMetadata,
  previous: MediaMetadata | null,
): MediaMetadata {
  if (metadata.imdbId && previous?.imdbId && metadata.imdbId !== previous.imdbId) {
    return metadata;
  }
  const score = previous?.scores.find((candidate) => candidate.source === "IMDb");
  return score ? withImdbRating(metadata, score.value, score.votes ?? 0) : metadata;
}
