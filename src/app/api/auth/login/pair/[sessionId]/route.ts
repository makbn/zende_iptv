import { NextResponse } from "next/server";

import { userAuthJson } from "@/lib/auth/authenticate-user";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { issueSessionTokens } from "@/lib/auth/issue-session";
import { loginActivityFromRequest } from "@/lib/auth/request-activity";
import {
  completeLoginPairSession,
  getLoginPairSession,
} from "@/lib/auth/login-pair-store";
import { prisma } from "@/lib/db/prisma";

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

/** Mobile: approve an active pairing session from an authenticated account. */
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

  if (
    !json ||
    typeof json !== "object" ||
    !("approveCurrentSession" in json) ||
    json.approveCurrentSession !== true
  ) {
    return NextResponse.json(
      { error: "Pairing must be approved by a signed-in account." },
      { status: 400 },
    );
  }

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
