import "server-only";

import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";

export type VerifiedIptvCredential = {
  id: string;
  portalUsername: string;
};

/**
 * Validates Xtream-style portal username/password against stored API credentials (hashed secret).
 */
export async function verifyIptvPortalLogin(
  portalUsernameRaw: string,
  portalPasswordRaw: string,
): Promise<VerifiedIptvCredential | null> {
  const portalUsername = portalUsernameRaw.trim();
  const portalPassword = portalPasswordRaw.trim();
  if (!portalUsername || !portalPassword) return null;

  const row = await prisma.iptvClientCredential.findUnique({
    where: { portalUsername },
  });
  if (!row) return null;

  const ok = await verifyPassword(portalPassword, row.passwordHash);
  if (!ok) return null;

  void prisma.iptvClientCredential
    .update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return { id: row.id, portalUsername: row.portalUsername };
}
