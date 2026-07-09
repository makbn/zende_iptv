export type SubtitleSearchResult = {
  id: string;
  url: string;
  language: string;
  languageName: string;
  release: string;
  downloadCount: number;
  hearingImpaired: boolean;
  format?: string;
  source?: string;
  featureTitle?: string;
};

export type SubtitleSearchQuery = {
  languages?: string;
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
  type?: "movie" | "episode";
  /** Optional Wyzie release / filename filter. */
  releaseFilter?: string;
};

export type SubtitleLoadResult = {
  trackId: string;
  label: string;
  language: string;
  vttUrl: string;
};
