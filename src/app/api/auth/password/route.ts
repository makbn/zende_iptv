import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { revokeAllRefreshTokensForUser } from "@/lib/auth/refresh-token-db";
import { prisma } from "@/lib/db/prisma";
import { passwordSchema } from "@/lib/validation/auth-schemas";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export async function PATCH(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (!gate.authEnabled) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Use a password of at least 8 characters." }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: gate.user.id } });
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  await revokeAllRefreshTokensForUser(user.id);
  return NextResponse.json({ ok: true });
}
