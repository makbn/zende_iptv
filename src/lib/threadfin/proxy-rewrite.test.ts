import { describe, expect, it } from "vitest";

import {
  rewriteThreadfinDiscover,
  rewriteThreadfinLineup,
  rewriteThreadfinText,
} from "@/lib/threadfin/proxy-rewrite";

const base = "https://live.example.test/thf";

describe("Threadfin public path rewriting", () => {
  it("publishes path-aware discovery URLs", () => {
    expect(rewriteThreadfinDiscover({ DeviceID: "test" }, base)).toMatchObject({
      BaseURL: base,
      LineupURL: `${base}/lineup.json`,
    });
  });

  it("rewrites lineup stream URLs through the same path", () => {
    expect(
      rewriteThreadfinLineup(
        [{ GuideName: "One", URL: "http://threadfin:34400/stream/abc" }],
        base,
      ),
    ).toEqual([{ GuideName: "One", URL: `${base}/stream/abc` }]);
  });

  it("rewrites absolute and root-relative Threadfin assets", () => {
    expect(
      rewriteThreadfinText(
        'http://threadfin:34400/m3u/threadfin.m3u href="/web" src="/web/css/app.css"',
        base,
      ),
    ).toBe(
      `${base}/m3u/threadfin.m3u href="${base}/web" src="${base}/web/css/app.css"`,
    );
  });
});
