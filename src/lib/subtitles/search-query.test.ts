import { describe, expect, it } from "vitest";

import {
  hasResolvableMediaId,
  rankSubtitleResults,
  releaseTokensFromTitle,
} from "@/lib/subtitles/search-query";
import type { SubtitleSearchResult } from "@/lib/subtitles/types";

function hit(partial: Partial<SubtitleSearchResult> & Pick<SubtitleSearchResult, "id" | "release">): SubtitleSearchResult {
  return {
    url: "https://example.test/a",
    language: "en",
    languageName: "English",
    downloadCount: 1,
    hearingImpaired: false,
    ...partial,
  };
}

describe("releaseTokensFromTitle", () => {
  it("extracts bracket language tags from IPTV names", () => {
    expect(releaseTokensFromTitle("#blackAF [MULTI-SUB]", "S01E02 [EN/FR]")).toEqual(
      expect.arrayContaining(["MULTI-SUB", "EN", "FR"]),
    );
  });
});

describe("rankSubtitleResults", () => {
  it("prefers releases that match portal language tags", () => {
    const ranked = rankSubtitleResults(
      [
        hit({ id: "1", release: "Show.S01E02.WEBRip", downloadCount: 900 }),
        hit({ id: "2", release: "Show.S01E02.EN.FR.WEB-DL", downloadCount: 10 }),
      ],
      ["EN", "FR"],
    );
    expect(ranked[0]?.id).toBe("2");
  });
});

describe("hasResolvableMediaId", () => {
  it("accepts TMDB ids on the playback session", () => {
    expect(
      hasResolvableMediaId({
        title: "Show",
        playback: { contentKind: "episode", tmdbId: "100088" },
      }),
    ).toBe(true);
  });
});
