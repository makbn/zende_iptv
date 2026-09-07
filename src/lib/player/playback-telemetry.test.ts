import { describe, expect, it } from "vitest";

import { serializeTimeRanges, streamSessionIdFromUrl } from "./playback-telemetry";

describe("playback telemetry", () => {
  it("correlates both proxy and transcode playback URLs", () => {
    expect(streamSessionIdFromUrl("/api/stream/proxy/abcdefgh1234")).toBe("abcdefgh1234");
    expect(streamSessionIdFromUrl("https://zende.test/api/stream/transcode/xyz_ABC-123.m3u8")).toBe("xyz_ABC-123");
    expect(streamSessionIdFromUrl("https://zende.test/movie/file.mp4")).toBeNull();
  });

  it("keeps only the newest bounded buffer ranges", () => {
    const ranges = {
      length: 3,
      start: (index: number) => [0, 10.126, 20.444][index]!,
      end: (index: number) => [5.555, 15.987, 30.001][index]!,
    } as TimeRanges;

    expect(serializeTimeRanges(ranges, 2)).toEqual([
      { start: 10.13, end: 15.99 },
      { start: 20.44, end: 30 },
    ]);
  });
});
