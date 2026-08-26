import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  enqueueRemoteCommand,
  getRemoteTvSession,
} from "@/lib/remote/remote-control-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("navigate"),
    payload: z.object({ href: z.string().min(1).max(2048) }),
  }),
  z.object({
    type: z.enum(["togglePlay", "play", "pause"]),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal("skip"),
    payload: z.object({ seconds: z.number().finite().min(-3600).max(3600) }),
  }),
  z.object({
    type: z.literal("seekTo"),
    payload: z.object({ seconds: z.number().finite().min(0).max(24 * 3600) }),
  }),
]);

export async function GET(request: Request, context: RouteContext) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (!gate.authEnabled) return NextResponse.json({ commands: [], commandSeq: 0 });

  const { sessionId } = await context.params;
  const session = getRemoteTvSession(sessionId, gate.user.id);
  if (!session) {
    return NextResponse.json({ error: "TV session not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after") ?? 0);
  const commands = session.commands.slice(Math.max(0, Number.isFinite(after) ? after : 0));
  return NextResponse.json({
    commandSeq: session.commands.length,
    commands,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (!gate.authEnabled) {
    return NextResponse.json(
      { error: "Remote control requires authentication." },
      { status: 400 },
    );
  }

  const { sessionId } = await context.params;
  const json = await request.json().catch(() => ({}));
  const parsed = commandSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.type === "navigate") {
    const href = parsed.data.payload.href;
    if (!href.startsWith("/") || href.startsWith("//")) {
      return NextResponse.json({ error: "Only app-relative URLs are allowed." }, { status: 400 });
    }
  }

  const command = enqueueRemoteCommand(sessionId, gate.user.id, parsed.data);
  if (!command) {
    return NextResponse.json({ error: "TV session not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, command });
}
