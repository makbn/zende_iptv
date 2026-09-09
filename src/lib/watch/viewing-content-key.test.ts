import { describe, expect, it } from "vitest";

import { viewingContentKey } from "@/lib/watch/viewing-content-key";

describe("viewingContentKey", () => {
  it("uses one identity for every episode of a series", () => {
    const seasonFive = viewingContentKey({
      url: "https://provider.example/series/episode-520.mkv",
      name: "The Office · S5 E20",
      playback: {
        contentKind: "episode",
        seriesId: "provider-1:34978",
        season: "5",
        episodeNum: "20",
      },
    });
    const seasonSeven = viewingContentKey({
      url: "https://provider.example/series/episode-720.mkv",
      name: "The Office · S7 E20",
      playback: {
        contentKind: "episode",
        seriesId: "provider-1:34978",
        season: "7",
        episodeNum: "20",
      },
    });

    expect(seasonSeven).toBe(seasonFive);
  });

  it("merges legacy episode rows that only contain an episode-stamped title", () => {
    const current = viewingContentKey({
      url: "https://provider.example/series/user/pass/720.mkv",
      name: "EN| The Office 2005 · S7E20 · S07E20",
      playback: {
        contentKind: "episode",
        seriesId: "provider-1:34978",
        seriesTitle: "EN| The Office 2005",
      },
    });
    const legacy = viewingContentKey({
      url: "https://provider.example/series/user/pass/520.mkv",
      name: "EN| The Office 2005 · S5E20 · S05E20",
      playback: {
        contentKind: "episode",
        searchTitle: "EN| The Office 2005 · S5E20 · S05E20",
      },
    });

    expect(legacy).toBe(current);
  });

  it("does not merge different series", () => {
    expect(
      viewingContentKey({
        url: "first",
        playback: { contentKind: "episode", seriesId: "provider-1:10" },
      }),
    ).not.toBe(
      viewingContentKey({
        url: "second",
        playback: { contentKind: "episode", seriesId: "provider-1:11" },
      }),
    );
  });

  it("uses IMDb identity for movies across changing stream URLs", () => {
    const first = viewingContentKey({
      url: "https://provider.example/movie/old.mp4",
      playback: { contentKind: "movie", imdbId: "tt1234567" },
    });
    const second = viewingContentKey({
      url: "https://provider.example/movie/new.mp4",
      playback: { contentKind: "movie", imdbId: "TT1234567" },
    });

    expect(second).toBe(first);
  });

  it("falls back to the exact URL for live and unknown content", () => {
    expect(viewingContentKey({ url: "https://provider.example/live/1" })).toBe(
      "url:https://provider.example/live/1",
    );
  });
});
