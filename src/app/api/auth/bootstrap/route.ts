import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureAuthConfigRow, setAuthEnabled } from "@/lib/auth/auth-config";
import { issueSessionTokens } from "@/lib/auth/issue-session";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { usernameSchema, passwordSchema } from "@/lib/validation/auth-schemas";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

/**
 * One-time: create the bootstrap administrator and turn authentication on.
 * Only allowed when there are zero users.
 */
export async function POST(request: Request) {
  const count = await prisma.user.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Bootstrap already completed." },
      { status: 403 },
    );
  }

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

  const { username, password } = parsed.data;

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: "ADMIN",
      isBootstrapAdmin: true,
    },
  });

  await setAuthEnabled(true);
  await ensureAuthConfigRow();

  const tokens = await issueSessionTokens({
    id: user.id,
    username: user.username,
    role: user.role,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      isBootstrapAdmin: user.isBootstrapAdmin,
    },
    ...tokens,
  });
}
