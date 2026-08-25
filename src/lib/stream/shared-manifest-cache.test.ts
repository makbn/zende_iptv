import { beforeEach, describe, expect, it } from "vitest";

import {
  acquireSharedManifest,
  resetSharedManifestCacheForTests,
  sharedManifestCacheKey,
} from "@/lib/stream/shared-manifest-cache";

describe("shared manifest cache", () => {
  beforeEach(() => resetSharedManifestCacheForTests());

  it("coalesces viewers of the same canonical channel", async () => {
    const key = sharedManifestCacheKey("http://provider/live/user/pass/77.m3u8");
    const leader = acquireSharedManifest(key);
    const viewer235 = acquireSharedManifest(key);
    expect(leader.kind).toBe("leader");
    expect(viewer235.kind).toBe("wait");
    if (leader.kind !== "leader" || viewer235.kind !== "wait") return;

    leader.commit({
      body: "#EXTM3U\n#EXT-X-TARGETDURATION:11\n#EXTINF:10,\n77_1.ts\n",
      effectiveUrl: "http://edge/live.m3u8?token=one",
      contentType: "application/vnd.apple.mpegurl",
    });

    expect((await viewer235.value)?.effectiveUrl).toContain("token=one");
    expect(acquireSharedManifest(key).kind).toBe("hit");
  });

  it("falls back to the last snapshot when a refresh fails", () => {
    const key = sharedManifestCacheKey("http://provider/live/user/pass/77.m3u8");
    const first = acquireSharedManifest(key);
    if (first.kind !== "leader") return;
    const snapshot = first.commit({
      body: "#EXTM3U\n#EXT-X-TARGETDURATION:0.001\n77_1.ts\n",
      effectiveUrl: "http://edge/live.m3u8?token=one",
      contentType: "application/vnd.apple.mpegurl",
    });
    snapshot.expiresAt = 0;

    const refresh = acquireSharedManifest(key);
    expect(refresh.kind).toBe("leader");
    if (refresh.kind !== "leader") return;
    expect(refresh.fail()?.body).toContain("#EXTM3U");
  });
});
