import "server-only";

import type { UserRole } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";

import { getJwtSecretBytes } from "@/lib/auth/jwt-secret";

const ACCESS_EXPIRY = "15m";

export async function signAccessToken(payload: {
  userId: string;
  username: string;
  role: UserRole;
}): Promise<string> {
  const secret = getJwtSecretBytes();
  return new SignJWT({
    typ: "access",
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<{
  userId: string;
  username: string;
  role: UserRole;
} | null> {
  try {
    const secret = getJwtSecretBytes();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (payload.typ !== "access") return null;
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    const username =
      typeof payload.username === "string" ? payload.username : null;
    const role = payload.role as UserRole | undefined;
    if (!userId || !username || !role) return null;
    return { userId, username, role };
  } catch {
    return null;
  }
}
