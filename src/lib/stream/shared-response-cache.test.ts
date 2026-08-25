import { beforeEach, describe, expect, it } from "vitest";

import {
  acquireSharedStreamResponse,
  resetSharedStreamCacheForTests,
  sharedStreamCacheKey,
} from "@/lib/stream/shared-response-cache";

describe("shared stream response cache", () => {
  beforeEach(() => resetSharedStreamCacheForTests());

  it("coalesces an in-flight response and serves later hits", async () => {
    const leader = acquireSharedStreamResponse("same-segment");
    const follower = acquireSharedStreamResponse("same-segment");
    expect(leader.kind).toBe("leader");
    expect(follower.kind).toBe("wait");
    if (leader.kind !== "leader" || follower.kind !== "wait") return;

    leader.commit({
      status: 200,
      headers: { "content-type": "video/mp2t" },
      body: new Uint8Array([0x47, 1, 2]),
    });
    const joined = await follower.value;
    expect(joined?.body).toEqual(new Uint8Array([0x47, 1, 2]));

    const hit = acquireSharedStreamResponse("same-segment");
    expect(hit.kind).toBe("hit");
  });

  it("keys Xtream segments by channel and media sequence, not token or session context", () => {
    const channelUrl = "http://provider/live/user/pass/1410737.m3u8";
    const browserA = sharedStreamCacheKey({
      channelUrl,
      resourceKind: "segment",
      url: "http://edge/hlsr/token-a/user/pass/1410737/random-a/1410737_971.ts",
    });
    const browser235 = sharedStreamCacheKey({
      channelUrl,
      resourceKind: "segment",
      url: "http://edge/hlsr/token-b/user/pass/1410737/random-b/1410737_971.ts",
    });
    expect(browser235).toBe(browserA);
    expect(
      sharedStreamCacheKey({
        channelUrl,
        resourceKind: "segment",
        url: "http://edge/hlsr/token-b/user/pass/1410737/random-c/1410737_972.ts",
      }),
    ).not.toBe(browserA);
    expect(
      sharedStreamCacheKey({
        channelUrl: "http://provider/live/user/pass/99.m3u8",
        resourceKind: "segment",
        url: "http://edge/hlsr/token-b/user/pass/99/random-c/1410737_971.ts",
      }),
    ).not.toBe(browserA);
  });
});
