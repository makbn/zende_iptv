/** Threadfin and Plex reject or behave unreliably above this lineup size. */
export const PLEX_CHANNEL_LIMIT = 480;

/**
 * Keep a Plex-safe mixture instead of letting a large live catalog consume the
 * entire lineup before any movies are exported.
 */
export function selectPlexCatalogRows<T>(input: {
  live: T[];
  movies: T[];
  episodes: T[];
  maxChannels: number;
}): T[] {
  const limit = Math.max(1, Math.min(input.maxChannels, PLEX_CHANNEL_LIMIT));
  const liveTarget = Math.ceil((limit * 2) / 3);
  const movieTarget = limit - liveTarget;
  const selected = [
    ...input.live.slice(0, liveTarget),
    ...input.movies.slice(0, movieTarget),
  ];

  if (selected.length >= limit) return selected.slice(0, limit);

  const liveRemainder = input.live.slice(Math.min(liveTarget, input.live.length));
  const movieRemainder = input.movies.slice(Math.min(movieTarget, input.movies.length));
  return [
    ...selected,
    ...liveRemainder,
    ...movieRemainder,
    ...input.episodes,
  ].slice(0, limit);
}
