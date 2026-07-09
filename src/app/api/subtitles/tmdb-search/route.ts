import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { searchTmdbMedia } from "@/lib/tmdb/tmdb-client";
import { tmdbConfigured } from "@/lib/tmdb/tmdb-config";

export const runtime = "nodejs";

const querySchema = z.object({
  query: z.string().trim().min(1).max(256),
  type: z.enum(["movie", "tv", "any"]).optional(),
});

export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  if (!(await tmdbConfigured())) {
    return NextResponse.json(
      {
        enabled: false,
        results: [],
        error:
          "Title search is not configured. Add a TMDB API key in Settings → Integrations.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const results = await searchTmdbMedia(parsed.data.query, {
      preferType: parsed.data.type ?? "any",
    });
    return NextResponse.json({
      enabled: true,
      results,
      total: results.length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        enabled: true,
        results: [],
        error: err instanceof Error ? err.message : "TMDB search failed.",
      },
      { status: 502 },
    );
  }
}
