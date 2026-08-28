import { describe, expect, it } from "vitest";

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

describe("playback guide identity", () => {
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
});
