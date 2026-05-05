import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import { recordPlaybackHealthProbe } from "@/lib/health/probe-from-watch";

export const runtime = "nodejs";

const log = createServerLogger("api.channelHealth.probeFromWatch");

const bodySchema = z.object({
  url: z.string().min(4).max(4096),
  label: z.string().max(512).optional(),
  presetId: z.string().max(128).optional(),
});

/** Fire-and-forget reliability sample when the user opens Watch (same trust as loading the stream). */
export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const out = await recordPlaybackHealthProbe(parsed.data);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    log.warn("Playback probe failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 400 });
  }
}
