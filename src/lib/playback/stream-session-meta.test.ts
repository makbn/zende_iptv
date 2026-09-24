import { describe, expect, it } from "vitest";

import { cleanMediaDisplayTitle } from "@/lib/channel/channel-label";
import {
  parsePlaybackSessionMeta,
  parseXtreamDurationSeconds,
  serializePlaybackSessionMeta,
} from "@/lib/playback/stream-session-meta";

describe("parseXtreamDurationSeconds", () => {
  it("parses seconds as number", () => {
    expect(parseXtreamDurationSeconds({ duration: 5400 })).toBe(5400);
  });

  it("parses HH:MM:SS", () => {
    expect(parseXtreamDurationSeconds({ duration: "1:30:00" })).toBe(5400);
  });

  it("parses MM:SS", () => {
    expect(parseXtreamDurationSeconds({ runtime: "45:30" })).toBe(2730);
  });
});

describe("cleanMediaDisplayTitle", () => {
  it("strips language and multi-sub tags", () => {
    expect(cleanMediaDisplayTitle("The Bear [EN] [MULTI-SUB]")).toBe("The Bear");
    expect(cleanMediaDisplayTitle("[EN/FR] Dune (2021)")).toBe("Dune");
    expect(cleanMediaDisplayTitle("#blackAF")).toBe("blackAF");
  });
});

describe("playback session meta", () => {
  it("persists provider-scoped EPG identity with a stream session", () => {
    const restored = parsePlaybackSessionMeta(
      serializePlaybackSessionMeta({
        contentKind: "live",
        guideProviderId: " provider-a ",
        guideTvgId: " TSN.ca@feed ",
      }),
    );

    expect(restored).toMatchObject({
      contentKind: "live",
      guideProviderId: "provider-a",
      guideTvgId: "TSN.ca@feed",
    });
  });

  it("persists audio tracks for the player chrome", () => {
    const restored = parsePlaybackSessionMeta(
      serializePlaybackSessionMeta({
        contentKind: "movie",
        displayTitle: "Dune",
        audioTracks: [
          { index: 0, label: "English", language: "en" },
          { index: 1, label: " Français ", language: " fr " },
        ],
      }),
    );

    expect(restored.audioTracks).toEqual([
      { index: 0, label: "English", language: "en" },
      { index: 1, label: "Français", language: "fr" },
    ]);
  });

  it("persists intro windows and neighbor watchIds without requiring playUrl", () => {
    const restored = parsePlaybackSessionMeta(
      serializePlaybackSessionMeta({
        contentKind: "episode",
        displayTitle: "Silo",
        displaySubtitle: "S3E3 · The Fragile",
        tmdbId: "125988",
        season: "3",
        episodeNum: "3",
        intro: [{ startMs: 621915, endMs: 734615 }],
        hasNext: true,
        next: {
          season: "3",
          episodeNum: "4",
          title: "The Safeguard",
          watchId: "tJhlH9gbZ3JTHn9j98GXTMiG",
          episodeIndex: 3,
          durationSeconds: 2400,
        },
      }),
    );

    expect(restored.intro).toEqual([{ startMs: 621915, endMs: 734615 }]);
    expect(restored.next).toMatchObject({
      watchId: "tJhlH9gbZ3JTHn9j98GXTMiG",
      season: "3",
      episodeNum: "4",
    });
    expect(restored.next?.playUrl).toBeUndefined();
  });
});
