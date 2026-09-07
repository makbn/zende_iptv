export const IMDB_RATING_THRESHOLDS = [9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export type ImdbRatingThreshold = (typeof IMDB_RATING_THRESHOLDS)[number];

export function parseMinImdbRating(value: unknown): ImdbRatingThreshold | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isInteger(parsed)) return null;
  return IMDB_RATING_THRESHOLDS.find((threshold) => threshold === parsed) ?? null;
}

export function buildImdbRatingFacets(
  ratings: Array<number | null | undefined>,
): Array<{ min: ImdbRatingThreshold; count: number }> {
  return IMDB_RATING_THRESHOLDS.map((min) => ({
    min,
    count: ratings.filter(
      (rating): rating is number => typeof rating === "number" && rating >= min,
    ).length,
  }));
}
