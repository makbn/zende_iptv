import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import { authorizeStreamSession } from "@/lib/stream/stream-session-auth";
import { touchSession } from "@/lib/stream/stream-session-store";
import {
  pruneViewingHistory,
  saveViewingHistoryEntry,
} from "@/lib/watch/viewing-history-store";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(4).max(8192).optional(),
  sessionId: z.string().min(8).max(256).optional(),
  positionSeconds: z.number().finite().min(0).max(86400 * 12),
  name: z.string().max(512).optional(),
  tvgLogo: z.string().max(8192).optional(),
  groupTitle: z.string().max(512).optional(),
  playback: z.record(z.string(), z.unknown()).optional(),
}).refine((body) => Boolean(body.url || body.sessionId), {
  message: "url or sessionId required",
});

const GUEST_USER_ID = "__guest__";

async function resolveUserId(request: Request): Promise<string | Response> {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (gate.authEnabled) return gate.user.id;
  return GUEST_USER_ID;
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (userId instanceof Response) return userId;

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

  const position = Math.round(parsed.data.positionSeconds);
  let historyInput;

  if (parsed.data.sessionId) {
    const session = await touchSession(parsed.data.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Unknown or expired session." }, { status: 404 });
    }
    const authorizationFailure = await authorizeStreamSession(
      request,
      session,
      parsed.data.sessionId,
    );
    if (authorizationFailure) return authorizationFailure;
    historyInput = {
      url: session.upstreamRootUrl,
      name: session.title,
      tvgLogo: session.logo,
      groupTitle: session.group,
      playback: session.meta,
      positionSeconds: position,
    };
  } else {
    historyInput = {
      url: parsed.data.url!,
      name: parsed.data.name?.trim() || "Video",
      tvgLogo: parsed.data.tvgLogo,
      groupTitle: parsed.data.groupTitle,
      playback: parsed.data.playback as PlaybackSessionMeta | undefined,
      positionSeconds: position,
    };
  }

  const result = await saveViewingHistoryEntry(userId, historyInput, {
    minimumPositionSeconds: 60,
  });
  if (result.stored) await pruneViewingHistory(userId, 200);

  return NextResponse.json({ ok: true, stored: result.stored });
}
