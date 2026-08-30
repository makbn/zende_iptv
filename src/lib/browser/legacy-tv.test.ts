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

  it("flags Samsung Tizen 5.5 (2019 TVs that browse YouTube but not modern JS)", () => {
    const ua =
      "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.106 Safari/537.36";
    expect(isLegacyTvBrowser(ua)).toBe(true);
  });

  it("flags Samsung Tizen 6.0", () => {
    const ua =
      "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.146 Safari/537.36";
    expect(isLegacyTvBrowser(ua)).toBe(true);
  });

  it("allows modern Tizen 6.5", () => {
    const ua =
      "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.93 Safari/537.36";
    expect(isLegacyTvBrowser(ua)).toBe(false);
  });

  it("allows modern Tizen without a Chrome token", () => {
    const ua =
      "Mozilla/5.0 (SMART-TV; LINUX; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/9.0 TV Safari/537.36";
    expect(parseTizenMajorVersion(ua)).toBe(9);
    expect(parseChromeMajorVersion(ua)).toBeNull();
    expect(isLegacyTvBrowser(ua)).toBe(false);
  });

  it("flags LG webOS without Chrome token", () => {
    const ua =
      "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.31 (KHTML, like Gecko) Safari/537.31";
    expect(isLegacyTvBrowser(ua)).toBe(true);
  });

  it("flags LG NetCast", () => {
    const ua =
      "Mozilla/5.0 (Linux; NetCast; U) AppleWebKit/537.31 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.31 SmartTV/5.0";
    expect(isLegacyTvBrowser(ua)).toBe(true);
  });

  it("allows desktop Chrome", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(isLegacyTvBrowser(ua)).toBe(false);
  });
});
