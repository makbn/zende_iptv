import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      role: true,
      isDisabled: true,
      createdAt: true,
      lastLoginAt: true,
      lastActivityAt: true,
      lastLoginIp: true,
      lastLoginLocation: true,
      lastLoginDevice: true,
      viewingHistory: {
        orderBy: { lastOpenedAt: "desc" },
        take: 50,
        select: {
          name: true,
          groupTitle: true,
          tvgLogo: true,
          lastOpenedAt: true,
          openCount: true,
        },
      },
      _count: { select: { favorites: true, viewingHistory: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ user });
}
