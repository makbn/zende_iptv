import { describe, expect, it, vi } from "vitest";

import {
  ZENDE_INTERNAL_RELAY_HEADER,
  internalRelayHeaderValue,
} from "@/lib/stream/internal-relay-request";

import { getRequestOrigin } from "./request-origin";

describe("getRequestOrigin", () => {
  it("uses loopback origin for /api/stream/proxy on 127.0.0.1 even when PUBLIC_APP_URL is set", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://cdn.example.com");
    const req = new Request("http://127.0.0.1:8077/api/stream/proxy/abc?h=deadbeef", {
      headers: { host: "127.0.0.1:8077" },
    });
    expect(getRequestOrigin(req)).toBe("http://127.0.0.1:8077");
    vi.unstubAllEnvs();
  });

  it("still uses PUBLIC_APP_URL for non-proxy paths on real hosts", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://cdn.example.com");
    const req = new Request("https://wrong-host/api/health", {
      headers: { host: "wrong-host" },
    });
    expect(getRequestOrigin(req)).toBe("https://cdn.example.com");
    vi.unstubAllEnvs();
  });

  it("internal relay header forces request URL origin", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://cdn.example.com");
    const req = new Request("http://127.0.0.1:8077/api/stream/proxy/xyz", {
      headers: {
        host: "127.0.0.1:8077",
        [ZENDE_INTERNAL_RELAY_HEADER]: internalRelayHeaderValue(),
      },
    });
    expect(getRequestOrigin(req)).toBe("http://127.0.0.1:8077");
    vi.unstubAllEnvs();
  });

  it("does not trust an internal relay header on a public host", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://cdn.example.com");
    const req = new Request("https://live.example.com/api/stream/proxy/xyz", {
      headers: {
        host: "live.example.com",
        [ZENDE_INTERNAL_RELAY_HEADER]: internalRelayHeaderValue(),
      },
    });
    expect(getRequestOrigin(req)).toBe("https://cdn.example.com");
    vi.unstubAllEnvs();
  });
});
