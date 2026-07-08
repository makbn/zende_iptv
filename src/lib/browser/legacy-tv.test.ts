import { describe, expect, it } from "vitest";

import {
  isLegacyTvBrowser,
  parseChromeMajorVersion,
  parseTizenMajorVersion,
} from "@/lib/browser/legacy-tv";

describe("legacy-tv detection", () => {
  it("flags Samsung Tizen 3.5", () => {
    const ua =
      "Mozilla/5.0 (SMART-TV; LINUX; Tizen 3.5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.69 Safari/537.36";
    expect(parseTizenMajorVersion(ua)).toBe(3.5);
    expect(parseChromeMajorVersion(ua)).toBe(47);
    expect(isLegacyTvBrowser(ua)).toBe(true);
  });

  it("allows modern Tizen", () => {
    const ua =
      "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.93 Safari/537.36";
    expect(isLegacyTvBrowser(ua)).toBe(false);
  });

  it("allows desktop Chrome", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(isLegacyTvBrowser(ua)).toBe(false);
  });
});
