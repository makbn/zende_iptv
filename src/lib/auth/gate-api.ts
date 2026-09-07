import "server-only";

import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@prisma/client";
import { canMutateSystem } from "@/lib/auth/user-permissions";

const log = createServerLogger("lib.auth.gate");

export function getBearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export const STREAM_ACCESS_COOKIE = "zende-stream-access";

function getCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const pair of raw.split(";")) {
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

/** Media elements cannot attach Bearer headers, so stream routes also accept this HttpOnly cookie. */
export function getStreamAccessToken(request: Request): string | null {
  return getBearerToken(request) ?? getCookie(request, STREAM_ACCESS_COOKIE);
}

export function setStreamAccessCookie(
  response: NextResponse,
  request: Request,
  token: string,
): void {
  response.cookies.set(STREAM_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure:
      process.env.NODE_ENV === "production" ||
      new URL(request.url).protocol === "https:",
    path: "/api/stream",
    maxAge: 14 * 24 * 60 * 60,
  });
}

export function clearStreamAccessCookie(response: NextResponse): void {
  response.cookies.set(STREAM_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/stream",
    maxAge: 0,
  });
}

async function gateRequestWithToken(
  request: Request,
  token: string | null,
): Promise<
  | { authEnabled: false }
  | {
      authEnabled: true;
      user: { id: string; username: string; role: UserRole };
    }
  | { authEnabled: true; response: Response }
> {
  const path = new URL(request.url).pathname;
  const cfg = await ensureAuthConfigRow();
  if (!cfg.enabled) return { authEnabled: false };

  if (!token) {
    log.warn("api unauthorized: missing bearer", { path });
    return {
      authEnabled: true,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    log.warn("api unauthorized: invalid token", { path });
    return {
      authEnabled: true,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, username: true, role: true, isDisabled: true, lastActivityAt: true },
  });
  if (!user || user.username !== payload.username || user.isDisabled) {
    log.warn("api unauthorized: user mismatch", { path, userId: payload.userId });
    return {
      authEnabled: true,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (
    !user.lastActivityAt ||
    Date.now() - user.lastActivityAt.getTime() > 5 * 60 * 1000
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() },
    });
  }

  return { authEnabled: true, user };
}

/**
 * When auth is off, APIs stay open. When auth is on, a valid access JWT is required.
 */
export async function gateApiRequest(request: Request): Promise<
  | { authEnabled: false }
  | {
      authEnabled: true;
      user: { id: string; username: string; role: UserRole };
    }
  | { authEnabled: true; response: Response }
> {
  return gateRequestWithToken(request, getBearerToken(request));
}

/** Auth gate for media URLs requested by fetch, hls.js, or native video elements. */
export async function gateStreamRequest(
  request: Request,
): ReturnType<typeof gateRequestWithToken> {
  return gateRequestWithToken(request, getStreamAccessToken(request));
}

export async function requireAdmin(request: Request): Promise<
  | { ok: true; user: { id: string; username: string; role: UserRole } }
  | { ok: false; response: Response }
> {
  const token = getBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Administrator session required." },
        { status: 403 },
      ),
    };
  }
  const payload = await verifyAccessToken(token);
  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Administrator session required." },
        { status: 403 },
      ),
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, username: true, role: true, isDisabled: true },
  });
  if (!user || user.isDisabled || user.username !== payload.username || user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}

/** Preserve legacy open-access mode, but never let a signed-in customer mutate system state. */
export function forbidCustomerSystemMutation(
  gate: Awaited<ReturnType<typeof gateApiRequest>>,
): Response | null {
  if ("response" in gate) return gate.response;
  if (!canMutateSystem(gate.authEnabled, gate.authEnabled ? gate.user.role : undefined)) {
    return NextResponse.json(
      { error: "Administrator permission required." },
      { status: 403 },
    );
  }
  return null;
}
