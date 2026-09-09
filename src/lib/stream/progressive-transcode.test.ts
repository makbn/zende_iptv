import { describe, expect, it } from "vitest";

import {
  buildProgressiveTranscodeArgs,
  buildProgressiveVodPlaylist,
} from "@/lib/stream/progressive-transcode";

describe("progressive browser transcode", () => {
  it("converts MKV/HEVC video to segmented H.264/AAC HLS", () => {
    const args = buildProgressiveTranscodeArgs(
      "http://127.0.0.1:8077/api/stream/proxy/session.mkv",
      "X-Zende-Internal-Relay: 1\r\n",
      "/tmp/session/playlist.m3u8",
      "/tmp/session/segment-%06d.ts",
    );

    expect(args).toContain("libx264");
    expect(args).toContain("superfast");
    expect(args).toContain("zerolatency");
    expect(args).toContain("passthrough");
    expect(args).toContain("scale=w='min(1920,iw)':h=-2");
    expect(args).toContain("10M");
    expect(args).toContain("yuv420p");
    expect(args).toContain("aac");
    expect(args).toContain("independent_segments+temp_file");
    expect(args).toContain("/tmp/session/segment-%06d.ts");
    expect(args.slice(-2)).toEqual([
      "/tmp/session/segment-%06d.ts",
      "/tmp/session/playlist.m3u8",
    ]);
  });

  it("starts seek windows at aligned input, timestamp, and segment offsets", () => {
    const args = buildProgressiveTranscodeArgs(
      "http://127.0.0.1:8077/api/stream/proxy/session.mkv",
      "X-Zende-Internal-Relay: 1\r\n",
      "/tmp/session/playlist.m3u8",
      "/tmp/session/segment-%06d.ts",
      { startSegment: 750, segmentCount: 30 },
    );

    expect(args).toContain("3000");
    expect(args).toContain("120");
    expect(args).toContain("750");
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args.slice(args.indexOf("-output_ts_offset"), args.indexOf("-output_ts_offset") + 2))
      .toEqual(["-output_ts_offset", "3000"]);
    expect(args.slice(args.indexOf("-start_number"), args.indexOf("-start_number") + 2))
      .toEqual(["-start_number", "750"]);
  });

  it("advertises the complete movie as finite VOD immediately", () => {
    const playlist = buildProgressiveVodPlaylist("session_123", 10.5);

    expect(playlist).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(playlist).toContain("#EXT-X-ENDLIST");
    expect(playlist.match(/^#EXTINF:/gm)).toHaveLength(3);
    expect(playlist).toContain("#EXTINF:2.500000,");
    expect(playlist).toContain(
      "/api/stream/transcode/session_123-000002.ts",
    );
  });
});
