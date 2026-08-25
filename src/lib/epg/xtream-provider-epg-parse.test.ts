import { describe, expect, it } from "vitest";

import {
  decodeXtreamEpgText,
  parseXtreamEpgListings,
} from "@/lib/epg/xtream-provider-epg-parse";
import { parseXtreamLiveIdFromStreamUrl } from "@/lib/iptv/xtream-url";

describe("Xtream provider EPG parsing", () => {
  it("decodes provider Base64 titles and preserves ordinary titles", () => {
    expect(decodeXtreamEpgText("VGhlIEFtYXppbmcgUmFjZSBDYW5hZGE=")).toBe(
      "The Amazing Race Canada",
    );
    expect(decodeXtreamEpgText("News")).toBe("News");
    expect(decodeXtreamEpgText("New York police judiciaire")).toBe(
      "New York police judiciaire",
    );
  });

  it("uses provider epoch timestamps for now/next rows", () => {
    const rows = parseXtreamEpgListings(
      [
        {
          title: "U0M=",
          start_timestamp: 1_787_590_800,
          stop_timestamp: "1787594400",
        },
      ],
      "tsn3.ca",
    );
    expect(rows).toEqual([
      {
        channelId: "tsn3.ca",
        title: "SC",
        startMs: 1_787_590_800_000,
        stopMs: 1_787_594_400_000,
      },
    ]);
  });

  it("falls back to UTC date strings and drops invalid windows", () => {
    const rows = parseXtreamEpgListings(
      [
        {
          title: "Programme",
          start: "2026-08-24 17:00:00",
          end: "2026-08-24 18:00:00",
        },
        {
          title: "Broken",
          start_timestamp: 20,
          stop_timestamp: 10,
        },
      ],
      "channel.id",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.startMs).toBe(Date.parse("2026-08-24T17:00:00Z"));
  });

  it("extracts the provider stream id from imported live URLs", () => {
    expect(
      parseXtreamLiveIdFromStreamUrl(
        "http://provider.example/live/user/password/1410737.m3u8",
      ),
    ).toBe("1410737");
    expect(
      parseXtreamLiveIdFromStreamUrl(
        "http://provider.example/movie/user/password/1410737.mp4",
      ),
    ).toBeNull();
  });
});
