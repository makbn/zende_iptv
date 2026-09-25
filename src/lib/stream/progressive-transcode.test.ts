import { describe, expect, it } from "vitest";

import {
  buildHdrToneMapVf,
  buildProgressiveTranscodeArgs,
  buildProgressiveVodPlaylist,
  SDR_COMPAT_VF,
} from "@/lib/stream/progressive-transcode";
import { videoStreamNeedsHdrToneMap } from "@/lib/stream/video-color-probe";

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
    expect(args).toContain(SDR_COMPAT_VF);
    expect(args[args.indexOf("-vf") + 1]).toBe(SDR_COMPAT_VF);
    expect(args).toContain("10M");
    expect(args).toContain("yuv420p");
    expect(args).toContain("bt709");
    expect(args).toContain("aac");
    expect(args).toContain("independent_segments+temp_file");
    expect(args).toContain("/tmp/session/segment-%06d.ts");
    expect(args.slice(-2)).toEqual([
      "/tmp/session/segment-%06d.ts",
      "/tmp/session/playlist.m3u8",
    ]);
  });

  it("tone-maps HDR sources into Rec.709 SDR without touching SDR defaults", () => {
    const args = buildProgressiveTranscodeArgs(
      "http://127.0.0.1:8077/api/stream/proxy/session.mkv",
      "X-Zende-Internal-Relay: 1\r\n",
      "/tmp/session/playlist.m3u8",
      "/tmp/session/segment-%06d.ts",
      { hdrToneMapKind: "pq" },
    );
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf.startsWith("scale=w='min(1920,iw)'")).toBe(true);
    expect(vf).toContain("colorspace=");
    expect(vf).toContain("bt2020-10");
    expect(vf.indexOf("scale=")).toBeLessThan(vf.indexOf("colorspace="));
    expect(args).not.toContain(SDR_COMPAT_VF);
  });

  it("keeps HDR filter graphs parseable by stock FFmpeg colorspace", () => {
    const pq = buildHdrToneMapVf("pq");
    const hlg = buildHdrToneMapVf("hlg");
    expect(pq).toContain("bt2020-10");
    expect(hlg).toContain("bt2020-10");
    expect(pq).not.toContain("smpte2084");
    expect(hlg).not.toContain("arib-std-b67");
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

  it("maps the selected upstream audio stream index", () => {
    const args = buildProgressiveTranscodeArgs(
      "http://127.0.0.1:8077/api/stream/proxy/session.mkv",
      "X-Zende-Internal-Relay: 1\r\n",
      "/tmp/session/playlist.m3u8",
      "/tmp/session/segment-%06d.ts",
      { audioTrackIndex: 2 },
    );

    expect(args).toContain("0:a:2?");
    expect(args).not.toContain("0:a:0?");
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

describe("videoStreamNeedsHdrToneMap", () => {
  it("detects PQ / HLG transfer characteristics", () => {
    expect(
      videoStreamNeedsHdrToneMap({
        codec_type: "video",
        color_transfer: "smpte2084",
        color_primaries: "bt2020",
        pix_fmt: "yuv420p10le",
      }),
    ).toBe(true);
    expect(
      videoStreamNeedsHdrToneMap({
        codec_type: "video",
        color_transfer: "arib-std-b67",
        pix_fmt: "yuv420p10le",
      }),
    ).toBe(true);
  });

  it("leaves ordinary SDR Rec.709 alone", () => {
    expect(
      videoStreamNeedsHdrToneMap({
        codec_type: "video",
        color_transfer: "bt709",
        color_primaries: "bt709",
        pix_fmt: "yuv420p",
      }),
    ).toBe(false);
    expect(
      videoStreamNeedsHdrToneMap({
        codec_type: "video",
        pix_fmt: "yuv420p",
      }),
    ).toBe(false);
  });
});
