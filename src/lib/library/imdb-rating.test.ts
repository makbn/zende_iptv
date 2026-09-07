import { describe, expect, it } from "vitest";

import {
  buildImdbRatingFacets,
  parseMinImdbRating,
} from "@/lib/library/imdb-rating";

describe("IMDb library rating filters", () => {
  it("accepts only supported whole-number thresholds", () => {
    expect(parseMinImdbRating("9")).toBe(9);
    expect(parseMinImdbRating(7)).toBe(7);
    expect(parseMinImdbRating("7.9")).toBeNull();
    expect(parseMinImdbRating("0")).toBeNull();
    expect(parseMinImdbRating("10")).toBeNull();
    expect(parseMinImdbRating("nope")).toBeNull();
  });

  it("builds cumulative 9+, 8+, 7+ counts and ignores unrated titles", () => {
    const facets = buildImdbRatingFacets([9.4, 8, 7.9, 6.2, null, undefined]);
    expect(facets.find((facet) => facet.min === 9)?.count).toBe(1);
    expect(facets.find((facet) => facet.min === 8)?.count).toBe(2);
    expect(facets.find((facet) => facet.min === 7)?.count).toBe(3);
    expect(facets.find((facet) => facet.min === 6)?.count).toBe(4);
  });
});
