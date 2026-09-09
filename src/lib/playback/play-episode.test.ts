import { describe, expect, it } from "vitest";

import type { SeriesEpisodeRow } from "@/app/api/xtream/series-info/route";
import { resolveSeriesEpisodeIndex } from "@/lib/playback/play-episode";

const episodes: SeriesEpisodeRow[] = [
  { season: "1", episodeNum: "1", title: "Pilot", playUrl: "/series/s1e1.mp4" },
  { season: "1", episodeNum: "2", title: "Second", playUrl: "/series/s1e2.mp4" },
  { season: "2", episodeNum: "1", title: "Premiere", playUrl: "/series/s2e1.mp4" },
];

describe("resolveSeriesEpisodeIndex", () => {
  it("uses a valid stored index", () => {
    expect(
      resolveSeriesEpisodeIndex(episodes, {
        episodeIndex: 1,
        season: "1",
        episodeNum: "2",
      }),
    ).toBe(1);
  });

  it("recovers from a stale stored index using season and episode", () => {
    expect(
      resolveSeriesEpisodeIndex(episodes, {
        episodeIndex: 1,
        season: "2",
        episodeNum: "1",
      }),
    ).toBe(2);
  });

  it("keeps the next flat item across a season boundary", () => {
    const finaleIndex = resolveSeriesEpisodeIndex(episodes, {
      episodeIndex: 1,
      season: "1",
      episodeNum: "2",
    });
    expect(episodes[finaleIndex + 1]).toMatchObject({ season: "2", episodeNum: "1" });
  });
});
