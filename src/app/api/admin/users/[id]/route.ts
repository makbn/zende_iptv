import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/gate-api";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllRefreshTokensForUser } from "@/lib/auth/refresh-token-db";
import { prisma } from "@/lib/db/prisma";
import {
  passwordSchema,
  usernameSchema,
} from "@/lib/validation/auth-schemas";

export const runtime = "nodejs";

const patchSchema = z.object({
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const data: {
    username?: string;
    passwordHash?: string;
    role?: "ADMIN" | "USER";
  } = {};

  if (parsed.data.username !== undefined) {
    data.username = parsed.data.username;
  }
  if (parsed.data.password !== undefined) {
    data.passwordHash = await hashPassword(parsed.data.password);
  }
  if (parsed.data.role !== undefined) {
    data.role = parsed.data.role;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes." }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        role: true,
        isBootstrapAdmin: true,
      },
    });

    if (parsed.data.password !== undefined) {
      await revokeAllRefreshTokensForUser(id);
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json(
      { error: "Username already taken." },
      { status: 409 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const { id } = await context.params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (target.isBootstrapAdmin) {
    return NextResponse.json(
      { error: "The original administrator account cannot be deleted." },
      { status: 400 },
    );
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
