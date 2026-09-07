import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { gateStreamRequest } from "@/lib/auth/gate-api";
import { isInternalRelayRequest } from "@/lib/stream/internal-relay-request";
import type { StreamSessionRecord } from "@/lib/stream/stream-session-store";

const STREAM_GRANT_COOKIE_PREFIX = "zende-stream-grant-";

function grantCookieName(sessionId: string): string {
  return `${STREAM_GRANT_COOKIE_PREFIX}${sessionId}`;
}

function requestCookie(request: Request, name: string): string | null {
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export function createStreamSessionGrant(): string {
  return randomBytes(32).toString("base64url");
}

export function setStreamSessionGrantCookie(args: {
  response: NextResponse;
  request: Request;
  sessionId: string;
  grant: string;
  expiresAt: Date;
}): void {
  args.response.cookies.set(grantCookieName(args.sessionId), args.grant, {
    httpOnly: true,
    sameSite: "strict",
    secure:
      process.env.NODE_ENV === "production" ||
      new URL(args.request.url).protocol === "https:",
    path: "/api/stream",
    expires: args.expiresAt,
  });
}

function hasValidGrant(
  request: Request,
  sessionId: string,
  expectedHash: string,
): boolean {
  const grant = requestCookie(request, grantCookieName(sessionId));
  if (!grant) return false;
  const actual = Buffer.from(createHash("sha256").update(grant).digest("hex"));
  const expected = Buffer.from(expectedHash);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

/** Require the signed-in owner for browser sessions without breaking trusted server relays. */
export async function authorizeStreamSession(
  request: Request,
  session: StreamSessionRecord,
  sessionId: string,
): Promise<Response | null> {
  if (isInternalRelayRequest(request)) return null;

  if (session.accessGrantHash) {
    if (hasValidGrant(request, sessionId, session.accessGrantHash)) return null;
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (!session.ownerUserId) return null;

  const gate = await gateStreamRequest(request);
  if ("response" in gate) {
    gate.response.headers.set("Cache-Control", "private, no-store");
    return gate.response;
  }
  if (!gate.authEnabled || gate.user.id === session.ownerUserId) return null;

  // Do not confirm that another user's opaque stream session exists.
  return NextResponse.json(
    { error: "Unknown or expired session." },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  );
}
