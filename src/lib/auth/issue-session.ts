import "server-only";

import type { UserRole } from "@prisma/client";

import { signAccessToken } from "@/lib/auth/jwt";
import { createRefreshToken } from "@/lib/auth/refresh-token-db";

export async function issueSessionTokens(user: {
  id: string;
  username: string;
  role: UserRole;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccessToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  });
  const { rawToken } = await createRefreshToken(user.id);
  return { accessToken, refreshToken: rawToken };
}
