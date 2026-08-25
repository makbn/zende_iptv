import { describe, expect, it } from "vitest";

import {
  PLEX_CHANNEL_LIMIT,
  selectPlexCatalogRows,
} from "@/lib/threadfin/plex-selection";

describe("Plex-safe Threadfin selection", () => {
  it("keeps a two-thirds live and one-third movie mix", () => {
    const selected = selectPlexCatalogRows({
      live: ["l1", "l2", "l3", "l4", "l5", "l6"],
      movies: ["m1", "m2", "m3", "m4", "m5", "m6"],
      episodes: [],
      maxChannels: 6,
    });

    expect(selected).toEqual(["l1", "l2", "l3", "l4", "m1", "m2"]);
  });

  it("fills unused capacity from the remaining kinds", () => {
    const selected = selectPlexCatalogRows({
      live: ["l1"],
      movies: ["m1", "m2", "m3", "m4"],
      episodes: ["e1"],
      maxChannels: 5,
    });

    expect(selected).toEqual(["l1", "m1", "m2", "m3", "m4"]);
  });

  it("never exceeds Plex's channel ceiling", () => {
    const rows = Array.from({ length: 600 }, (_, index) => index);
    expect(
      selectPlexCatalogRows({
        live: rows,
        movies: rows,
        episodes: rows,
        maxChannels: 5_000,
      }),
    ).toHaveLength(PLEX_CHANNEL_LIMIT);
  });
});
