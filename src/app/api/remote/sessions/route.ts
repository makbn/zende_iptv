import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  listRemoteTvSessions,
  upsertRemoteTvSession,
} from "@/lib/remote/remote-control-store";

export const runtime = "nodejs";

const postBodySchema = z.object({
  sessionId: z.string().trim().optional().nullable(),
  label: z.string().trim().max(80).optional().nullable(),
  kind: z.enum(["tv", "desktop", "other"]).optional().nullable(),
  pathname: z.string().trim().max(2048).optional().nullable(),
});

export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (!gate.authEnabled) return NextResponse.json({ sessions: [] });

  const sessions = listRemoteTvSessions(gate.user.id).map((session) => ({
    sessionId: session.sessionId,
    label: session.label,
    kind: session.kind ?? "other",
    pathname: session.pathname ?? "/",
    lastSeenAt: session.lastSeenAt,
    createdAt: session.createdAt,
  }));
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (!gate.authEnabled) {
    return NextResponse.json(
      { error: "Remote control requires authentication." },
      { status: 400 },
    );
  }

  const json = await request.json().catch(() => ({}));
  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = upsertRemoteTvSession({
    userId: gate.user.id,
    sessionId: parsed.data.sessionId,
    label: parsed.data.label,
    kind: parsed.data.kind,
    pathname: parsed.data.pathname,
  });
  return NextResponse.json({
    sessionId: session.sessionId,
    label: session.label,
    kind: session.kind,
    pathname: session.pathname,
    lastSeenAt: session.lastSeenAt,
  });
}
