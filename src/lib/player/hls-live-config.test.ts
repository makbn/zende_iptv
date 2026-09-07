import { afterEach, describe, expect, it, vi } from "vitest";

import { Z_ACCESS } from "@/lib/auth/token-storage-keys";

import { getStreamHlsConfig } from "./hls-live-config";

afterEach(() => vi.unstubAllGlobals());

describe("authenticated HLS loading", () => {
  it("adds the stored bearer token to XHR manifest and segment requests", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: (key: string) => key === Z_ACCESS ? "tv-access" : null },
    });
    const setRequestHeader = vi.fn();
    const xhr = { setRequestHeader, withCredentials: false };

    getStreamHlsConfig().xhrSetup?.(xhr as unknown as XMLHttpRequest, "");

    expect(setRequestHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer tv-access",
    );
    expect(xhr.withCredentials).toBe(true);
  });

  it("adds the stored bearer token to fetch-loader requests", async () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: (key: string) => key === Z_ACCESS ? "tv-access" : null },
    });
    const fetchSetup = getStreamHlsConfig().fetchSetup!;

    const request = await fetchSetup(
      { url: "https://zende.test/api/stream/transcode/session.m3u8" } as never,
      { headers: new Headers({ Accept: "*/*" }) },
    );

    expect(request.headers.get("authorization")).toBe("Bearer tv-access");
    expect(request.credentials).toBe("same-origin");
  });
});
