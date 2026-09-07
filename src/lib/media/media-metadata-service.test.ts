import { describe, expect, it } from "vitest";

import {
  selectBestTmdbMatch,
  shouldUseCachedMediaMetadata,
} from "@/lib/media/media-metadata-service";
import type { MediaMetadata } from "@/lib/media/media-metadata";
import type { TmdbMediaMatch } from "@/lib/tmdb/types";

const results: TmdbMediaMatch[] = [
  { id: "1", tmdbId: "1", mediaType: "movie", title: "The Thing", year: "2011" },
  { id: "2", tmdbId: "2", mediaType: "movie", title: "The Thing", year: "1982" },
  { id: "3", tmdbId: "3", mediaType: "movie", title: "A Different Thing", year: "1982" },
];

describe("selectBestTmdbMatch", () => {
  it("prefers an exact normalized title and release year", () => {
    expect(selectBestTmdbMatch(results, "The Thing", "1982")?.tmdbId).toBe("2");
  });

  it("falls back to the first exact-title result when no year is available", () => {
    expect(selectBestTmdbMatch(results, "the thing")?.tmdbId).toBe("1");
  });
});

const minimalMetadata: MediaMetadata = {
  mediaType: "movie",
  source: "portal",
  title: "The Thing",
  genres: [],
  scores: [{ source: "IMDb", value: 8.2, max: 10 }],
  cast: [],
  fetchedAt: "2026-09-07T00:00:00.000Z",
};

describe("shouldUseCachedMediaMetadata", () => {
  it("refreshes a fresh IMDb-only record so artwork and cast can be enriched", () => {
    const now = Date.parse("2026-09-07T12:00:00.000Z");
    expect(shouldUseCachedMediaMetadata(minimalMetadata, now - 60_000, now)).toBe(false);
  });

  it("throttles another enrichment attempt for an incomplete record", () => {
    const now = Date.parse("2026-09-07T12:00:00.000Z");
    expect(shouldUseCachedMediaMetadata({
      ...minimalMetadata,
      enrichmentAttemptedAt: new Date(now - 60_000).toISOString(),
    }, now - 60_000, now)).toBe(true);
  });

  it("keeps a complete TMDB record for the normal cache window", () => {
    const now = Date.parse("2026-09-07T12:00:00.000Z");
    expect(shouldUseCachedMediaMetadata({
      ...minimalMetadata,
      source: "tmdb",
      backdropUrl: "https://image.tmdb.org/t/p/original/backdrop.jpg",
      cast: [{ name: "Kurt Russell" }],
    }, now - 60_000, now)).toBe(true);
  });
});
