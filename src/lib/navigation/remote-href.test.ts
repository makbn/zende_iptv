import { describe, expect, it } from "vitest";

import { sanitizeRemoteHref } from "@/lib/navigation/remote-href";

describe("sanitizeRemoteHref", () => {
  it("preserves opaque playback session query parameters", () => {
    expect(sanitizeRemoteHref("/watch?id=session%2Fabc")).toBe(
      "/watch?id=session%2Fabc",
    );
  });

  it("preserves other app query parameters and removes fragments", () => {
    expect(sanitizeRemoteHref("/library?query=sports#results")).toBe(
      "/library?query=sports",
    );
  });

  it("rejects absolute and protocol-relative navigation", () => {
    expect(sanitizeRemoteHref("https://example.com/watch?id=abc")).toBeNull();
    expect(sanitizeRemoteHref("//example.com/watch?id=abc")).toBeNull();
  });
});

