import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearImageCache,
  getImageCacheStats,
  loadCachedImage,
  readCachedImage,
} from "@/lib/media/image-cache";

describe("resource-specific image cache", () => {
  beforeEach(() => {
    clearImageCache("logo");
    clearImageCache("poster");
    clearImageCache("thumbnail");
  });

  it("keeps logo, poster, and thumbnail eviction independent", async () => {
    const loader = vi.fn(async () => ({
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    }));
    await loadCachedImage("logo", "same-url", loader);
    await loadCachedImage("poster", "same-url", loader);

    clearImageCache("logo");

    expect(readCachedImage("logo", "same-url")).toBeNull();
    expect(readCachedImage("poster", "same-url")?.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(getImageCacheStats("thumbnail").entries).toBe(0);
  });

  it("coalesces concurrent requests inside one namespace", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const loader = vi.fn(async () => {
      await gate;
      return { body: new Uint8Array([9]), contentType: "image/png" };
    });

    const first = loadCachedImage("thumbnail", "hero", loader);
    const second = loadCachedImage("thumbnail", "hero", loader);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect([a.state, b.state].sort()).toEqual(["COALESCED", "MISS"]);
  });
});

