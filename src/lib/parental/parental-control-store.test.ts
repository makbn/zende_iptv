import { describe, expect, it } from "vitest";

import {
  filterParentalChannels,
  isAdultContentChannel,
  isChannelParentalBlocked,
  normalizeParentalPatterns,
} from "@/lib/parental/parental-control-store";

describe("global parental-control matching", () => {
  it("normalizes, deduplicates, and keeps literal patterns", () => {
    expect(
      normalizeParentalPatterns([" Adult ", "XXX", "adult", "adult +18", ""]),
    ).toEqual(["adult", "xxx", "adult +18"]);
  });

  it("matches case-insensitive substrings in either name or group title", () => {
    const patterns = ["adult", "xxx"];
    expect(
      isChannelParentalBlocked(
        { name: "News", groupTitle: "XX | FOR ADULT" },
        patterns,
      ),
    ).toBe(true);
    expect(
      isChannelParentalBlocked(
        { name: "XXX| Example", groupTitle: "Entertainment" },
        patterns,
      ),
    ).toBe(true);
    expect(
      isChannelParentalBlocked(
        { name: "Family News", groupTitle: "Canada" },
        patterns,
      ),
    ).toBe(false);
  });

  it("filters blocked rows without changing the remaining row shape", () => {
    const rows = [
      { name: "Family", groupTitle: "Kids", url: "https://example.test/1" },
      { name: "Private", groupTitle: "For Adult", url: "https://example.test/2" },
    ];
    expect(filterParentalChannels(rows, ["adult"])).toEqual([rows[0]]);
  });

  it("recognizes common adult markers without substring false positives", () => {
    expect(isAdultContentChannel({ name: "XXX| Example", groupTitle: "Entertainment" })).toBe(true);
    expect(isAdultContentChannel({ name: "Private", groupTitle: "XX | FOR ADULT" })).toBe(true);
    expect(isAdultContentChannel({ name: "After Dark", groupTitle: "+18 Movies" })).toBe(true);
    expect(isAdultContentChannel({ name: "Foxx Sports", groupTitle: "Sports" })).toBe(false);
  });

  it("always applies the adult safety net while any parental policy is active", () => {
    const rows = [
      { name: "Family", groupTitle: "Kids" },
      { name: "Private", groupTitle: "XXX" },
    ];
    expect(filterParentalChannels(rows, ["violence"])).toEqual([rows[0]]);
    expect(isChannelParentalBlocked(rows[1], ["violence"])).toBe(true);
    expect(filterParentalChannels(rows, [])).toEqual(rows);
  });
});
