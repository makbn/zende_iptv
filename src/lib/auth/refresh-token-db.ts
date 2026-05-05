import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function createRefreshToken(userId: string): Promise<{
  rawToken: string;
  expiresAt: Date;
}> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });
  return { rawToken, expiresAt };
}

export async function rotateRefreshToken(rawToken: string): Promise<{
  userId: string;
  newRefreshToken: string;
} | null> {
  const tokenHash = hashRefreshToken(rawToken);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.refreshToken.delete({ where: { id: row.id } });
    return null;
  }
  await prisma.refreshToken.delete({ where: { id: row.id } });
  const next = await createRefreshToken(row.userId);
  return { userId: row.userId, newRefreshToken: next.rawToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}
