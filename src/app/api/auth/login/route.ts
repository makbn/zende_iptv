import { NextResponse } from "next/server";
import { z } from "zod";

import {
  authenticateUser,
  userAuthJson,
} from "@/lib/auth/authenticate-user";
import { issueSessionTokens } from "@/lib/auth/issue-session";
import { loginActivityFromRequest } from "@/lib/auth/request-activity";
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

  const auth = await authenticateUser(parsed.data.username, parsed.data.password);
  if ("status" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tokens = await issueSessionTokens({
    id: auth.user.id,
    username: auth.user.username,
    role: auth.user.role,
  });

  await prisma.user.update({
    where: { id: auth.user.id },
    data: loginActivityFromRequest(request),
  });

  return NextResponse.json({
    ok: true,
    user: userAuthJson(auth.user),
    ...tokens,
  });
}
