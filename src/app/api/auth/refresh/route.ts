import { NextResponse } from "next/server";
import { z } from "zod";

import { signAccessToken } from "@/lib/auth/jwt";
import { rotateRefreshToken } from "@/lib/auth/refresh-token-db";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  refreshToken: z.string().min(16),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rotated = await rotateRefreshToken(parsed.data.refreshToken);
  if (!rotated) {
    return NextResponse.json({ error: "Invalid refresh token." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: rotated.userId },
    select: { id: true, username: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid refresh token." }, { status: 401 });
  }

  const accessToken = await signAccessToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  return NextResponse.json({
    accessToken,
    refreshToken: rotated.newRefreshToken,
  });
}
