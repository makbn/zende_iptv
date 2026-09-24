import { describe, expect, it } from "vitest";

import {
  hintAudioTracksFromCatalog,
  isMultiLangCatalogHint,
} from "@/lib/playback/audio-tracks-hint";

describe("multi-lang catalog hints", () => {
  it("detects MULTI-LANG group titles", () => {
    expect(
      isMultiLangCatalogHint("[MULTI-LANG] MOVIES SINCE 2019 (4K&1080P)"),
    ).toBe(true);
    expect(isMultiLangCatalogHint("US Movies")).toBe(false);
  });

  it("returns placeholder tracks for multi-lang groups", () => {
    expect(
      hintAudioTracksFromCatalog("[MULTI-LANG] MOVIES SINCE 2019 (4K&1080P)"),
    ).toEqual([
      { index: 0, label: "Audio track 1" },
      { index: 1, label: "Audio track 2" },
    ]);
  });
});
