import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  dequeueRemoteCommands,
  enqueueRemoteCommand,
} from "@/lib/remote/remote-control-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("navigate"),
    payload: z.object({ href: z.string().min(1).max(2048) }),
  }),
  z.object({
    type: z.literal("playMedia"),
    payload: z.object({
      channel: z.object({
        url: z.string().min(4).max(8192),
        name: z.string().min(1).max(512),
        tvgLogo: z.string().max(8192).optional(),
        groupTitle: z.string().max(512).optional(),
        tvgId: z.string().max(512).optional(),
        providerId: z.string().max(128).optional(),
        contentType: z.enum(["live", "movie", "series"]).optional(),
        playback: z
          .object({
            contentKind: z.enum(["live", "movie", "episode"]).optional(),
            guideProviderId: z.string().max(128).optional(),
            guideTvgId: z.string().max(512).optional(),
            durationSeconds: z.number().finite().positive().optional(),
            seriesId: z.string().max(128).optional(),
            seriesTitle: z.string().max(512).optional(),
            season: z.string().max(32).optional(),
            episodeNum: z.string().max(32).optional(),
            episodeTitle: z.string().max(512).optional(),
            episodeIndex: z.number().int().min(0).optional(),
            searchTitle: z.string().max(512).optional(),
            year: z.string().max(8).optional(),
            imdbId: z.string().max(32).optional(),
          })
          .optional(),
      }),
    }),
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
  z.object({
    type: z.literal("subtitleTrack"),
    payload: z.object({
      track: z.object({
        id: z.string().trim().min(1).max(256),
        label: z.string().trim().min(1).max(256),
        language: z.string().trim().min(1).max(16),
        vttUrl: z.string().trim().startsWith("/api/subtitles/vtt/").max(512),
      }),
    }),
  }),
  z.object({
    type: z.literal("subtitleOff"),
    payload: z.object({}).optional(),
  }),
]);

export async function GET(request: Request, context: RouteContext) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (!gate.authEnabled) return NextResponse.json({ commands: [], commandSeq: 0 });

  const { sessionId } = await context.params;
  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after") ?? 0);
  const cursor = Math.max(0, Number.isFinite(after) ? after : 0);
  const delivery = dequeueRemoteCommands(sessionId, gate.user.id, cursor);
  if (!delivery) {
    return NextResponse.json({ error: "TV session not found." }, { status: 404 });
  }
  return NextResponse.json(delivery);
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
