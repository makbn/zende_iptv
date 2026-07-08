import "server-only";

import type { User } from "@prisma/client";

import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";

export type AuthFailure = { status: number; error: string };

export async function authenticateUser(
  username: string,
  password: string,
): Promise<{ user: User } | AuthFailure> {
  const cfg = await ensureAuthConfigRow();

  const user = await prisma.user.findUnique({
    where: { username },
  });
  if (!user) {
    return { status: 401, error: "Invalid credentials." };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { status: 401, error: "Invalid credentials." };
  }

  if (!cfg.enabled && user.role !== "ADMIN") {
    return {
      status: 403,
      error:
        "Open-access mode: only administrators can sign in to manage accounts.",
    };
  }

  return { user };
}

export function userAuthJson(user: User) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isBootstrapAdmin: user.isBootstrapAdmin,
  };
}
