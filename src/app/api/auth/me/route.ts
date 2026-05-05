import { NextResponse } from "next/server";

import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { getBearerToken } from "@/lib/auth/gate-api";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Current session when auth is on (optional Bearer — returns user: null if missing/invalid). */
export async function GET(request: Request) {
  const cfg = await ensureAuthConfigRow();
  if (!cfg.enabled) {
    return NextResponse.json({ authEnabled: false, user: null });
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ authEnabled: true, user: null });
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    return NextResponse.json({ authEnabled: true, user: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      username: true,
      role: true,
      isBootstrapAdmin: true,
    },
  });

  if (!user || user.username !== payload.username) {
    return NextResponse.json({ authEnabled: true, user: null });
  }

  return NextResponse.json({ authEnabled: true, user });
}
