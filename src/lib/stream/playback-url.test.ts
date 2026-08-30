import { describe, expect, it } from "vitest";

import {
  isXtreamLiveStreamUrl,
  normalizeXtreamLivePlaybackUrl,
  progressiveMediaContentType,
  progressivePlaybackExtension,
} from "@/lib/stream/playback-url";

describe("Xtream live playback URLs", () => {
  it("recognizes credential-path live streams", () => {
    expect(isXtreamLiveStreamUrl("http://provider.test/live/user/pass/42.m3u8")).toBe(true);
    expect(isXtreamLiveStreamUrl("https://provider.test/live/user/pass/42.ts?token=x")).toBe(true);
  });

  it("does not classify VOD or unrelated HLS as Xtream live", () => {
    expect(isXtreamLiveStreamUrl("http://provider.test/movie/user/pass/42.mp4")).toBe(false);
    expect(isXtreamLiveStreamUrl("http://provider.test/hls/42.m3u8")).toBe(false);
  });

  it("normalizes Xtream MPEG-TS live URLs to browser HLS", () => {
    expect(normalizeXtreamLivePlaybackUrl("http://provider.test/live/u/p/42.ts"))
      .toBe("http://provider.test/live/u/p/42.ts");
  });

  it("preserves MKV identity for progressive episode playback", () => {
    const url = "http://provider.test/series/user/pass/1024661.mkv?token=x";
    expect(progressivePlaybackExtension(url)).toBe(".mkv");
    expect(progressiveMediaContentType(url)).toBe("video/x-matroska");
  });
});
