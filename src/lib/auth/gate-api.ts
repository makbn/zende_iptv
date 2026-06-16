import "server-only";

import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@prisma/client";

const log = createServerLogger("lib.auth.gate");

export function getBearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
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
  const path = new URL(request.url).pathname;
  const cfg = await ensureAuthConfigRow();
  if (!cfg.enabled) {
    return { authEnabled: false };
  }

  const token = getBearerToken(request);
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
    select: { id: true, username: true, role: true },
  });
  if (!user || user.username !== payload.username) {
    log.warn("api unauthorized: user mismatch", { path, userId: payload.userId });
    return {
      authEnabled: true,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    authEnabled: true,
    user,
  };
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
    select: { id: true, username: true, role: true },
  });
  if (!user || user.username !== payload.username || user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
