import { describe, expect, it } from "vitest";

import { buildProgressiveTranscodeArgs } from "@/lib/stream/progressive-transcode";

describe("progressive browser transcode", () => {
  it("converts MKV/HEVC video to fragmented H.264/AAC MP4", () => {
    const args = buildProgressiveTranscodeArgs(
      "http://127.0.0.1:8077/api/stream/proxy/session.mkv",
      "X-Zende-Internal-Relay: 1\r\n",
    );

    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("aac");
    expect(args).toContain("+frag_keyframe+empty_moov+default_base_moof");
    expect(args.slice(-3)).toEqual(["-f", "mp4", "pipe:1"]);
  });
});
