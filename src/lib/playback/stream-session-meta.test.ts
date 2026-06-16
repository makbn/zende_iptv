import { describe, expect, it } from "vitest";

import { parseXtreamDurationSeconds } from "@/lib/playback/stream-session-meta";

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
