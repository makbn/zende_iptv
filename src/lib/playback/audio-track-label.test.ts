import { describe, expect, it } from "vitest";

import {
  formatAudioTrackLabel,
  shortAudioLanguage,
  shortAudioLayout,
  uniquifyAudioTrackLabels,
} from "@/lib/playback/audio-track-label";

describe("audio track labels", () => {
  it("maps languages to short IPTV-style codes", () => {
    expect(shortAudioLanguage("eng")).toBe("EN");
    expect(shortAudioLanguage("fra")).toBe("FR");
    expect(shortAudioLanguage("ell")).toBe("GR");
    expect(shortAudioLanguage("deu")).toBe("DE");
    expect(shortAudioLanguage("und")).toBeUndefined();
  });

  it("compacts surround layouts and skips stereo", () => {
    expect(shortAudioLayout({ channelLayout: "5.1" })).toBe("5.1");
    expect(shortAudioLayout({ channelLayout: "5.1(side)" })).toBe("5.1");
    expect(shortAudioLayout({ channels: 8 })).toBe("7.1");
    expect(shortAudioLayout({ channelLayout: "stereo" })).toBeUndefined();
    expect(shortAudioLayout({ title: "English Atmos" })).toBe("Atmos");
  });

  it("builds EN 5.1 / FR / GR style labels", () => {
    expect(
      formatAudioTrackLabel({
        index: 0,
        language: "eng",
        channels: 6,
        channelLayout: "5.1",
      }),
    ).toBe("EN 5.1");
    expect(
      formatAudioTrackLabel({
        index: 1,
        language: "eng",
        channels: 8,
        channelLayout: "7.1",
      }),
    ).toBe("EN 7.1");
    expect(formatAudioTrackLabel({ index: 2, language: "fra" })).toBe("FR");
    expect(formatAudioTrackLabel({ index: 3, language: "ell" })).toBe("GR");
  });

  it("ignores generic Track N titles from containers", () => {
    expect(
      formatAudioTrackLabel({
        index: 0,
        language: "eng",
        title: "Track 1",
        channelLayout: "5.1",
      }),
    ).toBe("EN 5.1");
    expect(
      formatAudioTrackLabel({
        index: 1,
        title: "Audio track 2",
      }),
    ).toBe("Track 2");
  });

  it("keeps commentary / special titles", () => {
    expect(
      formatAudioTrackLabel({
        index: 0,
        language: "eng",
        title: "Director Commentary",
      }),
    ).toBe("EN Director Commentary");
  });

  it("disambiguates duplicate labels", () => {
    expect(
      uniquifyAudioTrackLabels([
        { label: "EN" },
        { label: "EN" },
        { label: "FR" },
      ]),
    ).toEqual([{ label: "EN" }, { label: "EN (2)" }, { label: "FR" }]);
  });
});
