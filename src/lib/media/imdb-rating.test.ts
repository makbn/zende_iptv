import { describe, expect, it } from "vitest";

import {
  imdbTitleTypeMatchesMedia,
  normalizeImdbLookupTitle,
  parseImdbRatingRow,
  parseImdbTitleBasicsRow,
  withImdbRating,
} from "@/lib/media/imdb-rating";
import type { MediaMetadata } from "@/lib/media/media-metadata";

const metadata: MediaMetadata = {
  mediaType: "movie",
  source: "tmdb",
  title: "The Godfather Part III",
  genres: [],
  scores: [{ source: "TMDB", value: 7.4, max: 10 }],
  cast: [],
  fetchedAt: "2026-09-06T00:00:00.000Z",
};

describe("IMDb rating ingestion", () => {
  it("parses official title.ratings.tsv rows", () => {
    expect(parseImdbRatingRow("tt0099674\t7.6\t435000")).toEqual({
      imdbId: "tt0099674",
      rating: 7.6,
      votes: 435000,
    });
    expect(parseImdbRatingRow("tconst\taverageRating\tnumVotes")).toBeNull();
    expect(parseImdbRatingRow("tt0099674\t11\t1")).toBeNull();
  });

  it("adds IMDb first and replaces an older IMDb score", () => {
    const first = withImdbRating(metadata, 7.6, 435000);
    const updated = withImdbRating(first, 7.7, 440000);
    expect(updated.scores).toEqual([
      { source: "IMDb", value: 7.7, max: 10, votes: 440000 },
      { source: "TMDB", value: 7.4, max: 10 },
    ]);
  });

  it("parses and filters official title.basics rows", () => {
    expect(parseImdbTitleBasicsRow("tt0099674\tmovie\tThe Godfather Part III\tThe Godfather Part III\t0\t1990\t\\N\t162\tCrime,Drama")).toMatchObject({
      imdbId: "tt0099674",
      isAdult: false,
      year: "1990",
    });
    expect(imdbTitleTypeMatchesMedia("movie", "movie")).toBe(true);
    expect(imdbTitleTypeMatchesMedia("tvSpecial", "movie")).toBe(true);
    expect(imdbTitleTypeMatchesMedia("tvEpisode", "tv")).toBe(false);
    expect(normalizeImdbLookupTitle("The Godfather: Part III (4K)")).toBe("the godfather part iii");
    expect(normalizeImdbLookupTitle("EN| Four to Dinner [MULTI-SUB]")).toBe("four to dinner");
  });
});
