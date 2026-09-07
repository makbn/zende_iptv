import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  authorizeStreamSession,
  createStreamSessionGrant,
  setStreamSessionGrantCookie,
} from "@/lib/stream/stream-session-auth";
import type { StreamSessionRecord } from "@/lib/stream/stream-session-store";

function sharedSession(grant: string): StreamSessionRecord {
  return {
    ownerUserId: null,
    accessGrantHash: createHash("sha256").update(grant).digest("hex"),
    upstreamRootUrl: "https://provider.test/movie/user/pass/42.mp4",
    title: "Shared movie",
    meta: {},
    urlAliases: new Map(),
    aliasReferers: new Map(),
    cookieJar: {},
    lastRefererUrl: null,
    lastAccessAt: Date.now(),
    proxyConfig: null,
  };
}

describe("shared stream session authorization", () => {
  it("rejects a copied raw proxy URL without its HttpOnly grant", async () => {
    const grant = createStreamSessionGrant();
    const failure = await authorizeStreamSession(
      new Request("https://zende.test/api/stream/proxy/session-123.mp4"),
      sharedSession(grant),
      "session-123",
    );

    expect(failure?.status).toBe(401);
  });

  it("accepts the matching short-lived share cookie", async () => {
    const grant = createStreamSessionGrant();
    const response = new (await import("next/server")).NextResponse();
    setStreamSessionGrantCookie({
      response,
      request: new Request("https://zende.test/api/shares/share-token"),
      sessionId: "session-123",
      grant,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;

    const failure = await authorizeStreamSession(
      new Request("https://zende.test/api/stream/proxy/session-123.mp4", {
        headers: { cookie },
      }),
      sharedSession(grant),
      "session-123",
    );

    expect(failure).toBeNull();
  });
});
