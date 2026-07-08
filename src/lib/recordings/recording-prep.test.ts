import { describe, expect, it } from "vitest";

import { upstreamRootForRecording } from "@/lib/recordings/recording-prep";

describe("upstreamRootForRecording", () => {
  it("converts Xtream live m3u8 to ts for DVR", () => {
    expect(
      upstreamRootForRecording(
        "http://cf.listaiptv.net/live/user/pass/1239046.m3u8",
      ),
    ).toBe("http://cf.listaiptv.net/live/user/pass/1239046.ts");
  });

  it("leaves non-xtream urls unchanged", () => {
    const url = "https://cdn.example/hls/master.m3u8";
    expect(upstreamRootForRecording(url)).toBe(url);
  });
});
