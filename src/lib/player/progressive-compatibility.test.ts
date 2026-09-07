import { describe, expect, it } from "vitest";

import { progressiveCompatibilityUrl } from "./progressive-compatibility";

describe("progressive playback compatibility", () => {
  it("falls back to HLS when a proxied progressive source is unsupported", () => {
    expect(progressiveCompatibilityUrl({
      src: "/api/stream/proxy/wdQsEzl_nz2aqq4VqF5Yu7Hv.mp4",
      playbackMode: "progressive",
      mediaErrorCode: 4,
    })).toBe("/api/stream/transcode/wdQsEzl_nz2aqq4VqF5Yu7Hv.m3u8");
  });

  it("does not transcode other media errors or playback modes", () => {
    expect(progressiveCompatibilityUrl({
      src: "/api/stream/proxy/abcdefgh1234.mp4",
      playbackMode: "progressive",
      mediaErrorCode: 2,
    })).toBeNull();
    expect(progressiveCompatibilityUrl({
      src: "/api/stream/proxy/abcdefgh1234.m3u8",
      playbackMode: "hls",
      mediaErrorCode: 4,
    })).toBeNull();
  });

  it("does not rewrite arbitrary or already-transcoded URLs", () => {
    expect(progressiveCompatibilityUrl({
      src: "https://provider.test/movie/file.mp4",
      playbackMode: "progressive",
      mediaErrorCode: 4,
    })).toBeNull();
    expect(progressiveCompatibilityUrl({
      src: "/api/stream/transcode/abcdefgh1234.m3u8",
      playbackMode: "progressive",
      mediaErrorCode: 4,
    })).toBeNull();
  });
});
