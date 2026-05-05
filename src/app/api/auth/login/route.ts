import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { issueSessionTokens } from "@/lib/auth/issue-session";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { usernameSchema, passwordSchema } from "@/lib/validation/auth-schemas";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
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

  const cfg = await ensureAuthConfigRow();

  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { username },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (!cfg.enabled && user.role !== "ADMIN") {
    return NextResponse.json(
      {
        error:
          "Open-access mode: only administrators can sign in to manage accounts.",
      },
      { status: 403 },
    );
  }

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
