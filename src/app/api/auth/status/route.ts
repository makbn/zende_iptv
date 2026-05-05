import { NextResponse } from "next/server";

import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Public: whether login is required and whether bootstrap is possible. */
export async function GET() {
  const cfg = await ensureAuthConfigRow();
  const userCount = await prisma.user.count();

  return NextResponse.json({
    authEnabled: cfg.enabled,
    userCount,
    canBootstrap: userCount === 0,
  });
}
