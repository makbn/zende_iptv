import { describe, expect, it } from "vitest";

import { srtToVtt, subtitleTextToVtt } from "@/lib/subtitles/srt-to-vtt";

describe("srtToVtt", () => {
  it("converts basic SRT cues to WebVTT", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:06,000
Second line`;
    const vtt = srtToVtt(srt);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.500");
    expect(vtt).toContain("Hello world");
    expect(vtt).toContain("Second line");
  });

  it("passes through existing WebVTT", () => {
    const source = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi";
    expect(subtitleTextToVtt(source, "sample.vtt")).toBe(source);
  });
});
