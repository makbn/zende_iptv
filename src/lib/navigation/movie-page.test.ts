import { describe, expect, it } from "vitest";

import { moviePageHrefFromChannel } from "@/lib/navigation/movie-page";

describe("moviePageHrefFromChannel", () => {
  it("uses the durable provider channel row when available", () => {
    const href = moviePageHrefFromChannel({
      name: "Arrival (2016)",
      url: "http://portal/movie/user/pass/42.mp4",
      duration: -1,
      contentType: "movie",
      providerChannelId: "row-42",
    });
    expect(href).toContain("/library/movie/channel%3Arow-42");
    expect(href).toContain("title=Arrival");
  });
});
