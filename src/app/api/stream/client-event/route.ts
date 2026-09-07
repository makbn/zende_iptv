import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";

export const runtime = "nodejs";

const log = createServerLogger("api.stream.client-event");
const MAX_TELEMETRY_BYTES = 96 * 1024;

const recentEventSchema = z.object({
  atMs: z.number().finite().min(0).max(86400 * 1000),
  event: z.string().min(1).max(80),
  details: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({
  schemaVersion: z.literal(1).default(1),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  clientPlaybackId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  event: z.string().min(1).max(80),
  surface: z.enum(["tv", "mobile", "desktop", "unknown"]),
  currentTime: z.number().finite().min(0).max(86400 * 12),
  readyState: z.number().int().min(0).max(4),
  networkState: z.number().int().min(0).max(3),
  paused: z.boolean(),
  stallDurationMs: z.number().finite().min(0).max(86400 * 1000).optional(),
  errorCode: z.number().int().min(0).max(4).optional(),
  errorMessage: z.string().max(500).optional(),
  errorType: z.string().max(120).optional(),
  errorDetails: z.string().max(240).optional(),
  fatal: z.boolean().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  snapshot: z.record(z.string(), z.unknown()),
  recentEvents: z.array(recentEventSchema).max(60),
});

const persistedFaultEvents = new Set([
  "waiting",
  "waiting-update",
  "stalled",
  "error",
  "abort",
  "hls-error",
  "recovered",
]);

export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const raw = await request.text().catch(() => "");
  if (raw.length === 0 || raw.length > MAX_TELEMETRY_BYTES) {
    return NextResponse.json({ error: "Invalid playback telemetry size." }, { status: 413 });
  }
  const parsed = bodySchema.safeParse(
    (() => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid playback event." }, { status: 400 });
  }

  const details = {
    ...parsed.data,
    currentTime: Math.round(parsed.data.currentTime * 10) / 10,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? undefined,
  };
  if (persistedFaultEvents.has(parsed.data.event)) {
    // Error-level telemetry is also copied to the bounded host-visible
    // /logs/errors.ndjson file by the shared logger.
    log.error("playback telemetry fault", details);
  } else {
    log.info("playback telemetry", details);
  }

  return new Response(null, { status: 204 });
}
