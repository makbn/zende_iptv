import { NextResponse } from "next/server";
import { z } from "zod";

import {
  authenticateUser,
  userAuthJson,
} from "@/lib/auth/authenticate-user";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { issueSessionTokens } from "@/lib/auth/issue-session";
import { loginActivityFromRequest } from "@/lib/auth/request-activity";
import {
  completeLoginPairSession,
  getLoginPairSession,
} from "@/lib/auth/login-pair-store";
import { prisma } from "@/lib/db/prisma";
import { usernameSchema, passwordSchema } from "@/lib/validation/auth-schemas";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

/** TV: poll pairing status until mobile completes sign-in. */
export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const row = getLoginPairSession(sessionId);
  if (!row) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (row.status === "expired") {
    return NextResponse.json({ status: "expired" });
  }
  if (row.status === "complete" && row.accessToken && row.refreshToken && row.user) {
    return NextResponse.json({
      status: "complete",
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      user: row.user,
    });
  }
  return NextResponse.json({ status: "pending", expiresAt: row.expiresAt });
}

const credentialsBodySchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
const approveCurrentSessionBodySchema = z.object({
  approveCurrentSession: z.literal(true),
});

/** Mobile: submit credentials for an active pairing session. */
export async function POST(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const row = getLoginPairSession(sessionId);
  if (!row) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (row.status === "expired") {
    return NextResponse.json({ error: "Session expired." }, { status: 410 });
  }
  if (row.status === "complete") {
    return NextResponse.json({ ok: true, status: "complete" });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const approveCurrentSession = approveCurrentSessionBodySchema.safeParse(json);
  if (approveCurrentSession.success) {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;
    if (!gate.authEnabled) {
      return NextResponse.json(
        { error: "Current session approval requires authentication." },
        { status: 400 },
      );
    }
    const authUser = await prisma.user.findUnique({
      where: { id: gate.user.id },
    });
    if (!authUser || authUser.username !== gate.user.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tokens = await issueSessionTokens({
      id: authUser.id,
      username: authUser.username,
      role: authUser.role,
    });
    await prisma.user.update({
      where: { id: authUser.id },
      data: loginActivityFromRequest(request),
    });
    const user = userAuthJson(authUser);
    const ok = completeLoginPairSession(sessionId, {
      ...tokens,
      user,
    });
    if (!ok) {
      return NextResponse.json({ error: "Session expired." }, { status: 410 });
    }
    return NextResponse.json({ ok: true, status: "complete", user });
  }

  const parsed = credentialsBodySchema.safeParse(json);
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

  const user = userAuthJson(auth.user);
  const ok = completeLoginPairSession(sessionId, {
    ...tokens,
    user,
  });
  if (!ok) {
    return NextResponse.json({ error: "Session expired." }, { status: 410 });
  }

  return NextResponse.json({ ok: true, status: "complete", user });
}
