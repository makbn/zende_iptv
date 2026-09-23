import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { lookupIntroSegments } from "@/lib/media/intro-db";

export const runtime = "nodejs";

const querySchema = z.object({
  imdbId: z.string().trim().max(32).optional(),
  tmdbId: z.string().trim().max(32).optional(),
  season: z.coerce.number().int().min(0).max(99).optional(),
  episode: z.coerce.number().int().min(0).max(999).optional(),
});

/** Skip-intro windows for a movie or a single episode. */
export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    imdbId: url.searchParams.get("imdbId") ?? undefined,
    tmdbId: url.searchParams.get("tmdbId") ?? undefined,
    season: url.searchParams.get("season") ?? undefined,
    episode: url.searchParams.get("episode") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  if (!parsed.data.imdbId && !parsed.data.tmdbId) {
    return NextResponse.json({ segments: [] });
  }

  try {
    const segments = await lookupIntroSegments(parsed.data);
    return NextResponse.json({ segments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not look up the intro." },
      { status: 502 },
    );
  }
}
