import { beforeEach, describe, expect, it, vi } from "vitest";

const { touchSession } = vi.hoisted(() => ({ touchSession: vi.fn() }));

vi.mock("@/lib/stream/stream-session-store", () => ({ touchSession }));

import { GET } from "./route";

describe("stream session metadata privacy", () => {
  beforeEach(() => touchSession.mockReset());

  it("never serializes the upstream provider URL or its credentials", async () => {
    touchSession.mockResolvedValue({
      ownerUserId: null,
      accessGrantHash: null,
      upstreamRootUrl: "http://provider.test/movie/private-user/private-pass/42.mp4",
      title: "Movie",
      meta: { contentKind: "movie" },
      urlAliases: new Map(),
      aliasReferers: new Map(),
      cookieJar: {},
      lastRefererUrl: null,
      lastAccessAt: Date.now(),
      proxyConfig: null,
    });

    const response = await GET(
      new Request("https://zende.test/api/stream/session/session-123"),
      { params: Promise.resolve({ id: "session-123" }) },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain("provider.test");
    expect(body).not.toContain("private-user");
    expect(body).not.toContain("private-pass");
    expect(JSON.parse(body)).not.toHaveProperty("canonicalUrl");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
