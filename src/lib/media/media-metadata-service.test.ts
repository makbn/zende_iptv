import { describe, expect, it } from "vitest";

import { selectBestTmdbMatch } from "@/lib/media/media-metadata-service";
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
