export type TmdbMediaMatch = {
  id: string;
  tmdbId: string;
  mediaType: "movie" | "tv";
  title: string;
  year?: string;
  overview?: string;
  posterUrl?: string | null;
};
