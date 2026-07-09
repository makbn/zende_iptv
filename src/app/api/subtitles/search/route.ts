import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { wyzieConfigured } from "@/lib/subtitles/wyzie-config";
import {
  resolveWyzieMediaId,
  searchWyzieSubtitles,
  WyzieRequestError,
} from "@/lib/subtitles/wyzie-client";

export const runtime = "nodejs";

const querySchema = z.object({
  languages: z.string().trim().max(64).optional(),
  imdbId: z.string().trim().max(32).optional(),
  tmdbId: z.string().trim().max(32).optional(),
  season: z.coerce.number().int().min(0).max(99).optional(),
  episode: z.coerce.number().int().min(0).max(999).optional(),
  type: z.enum(["movie", "episode"]).optional(),
  releaseFilter: z.string().trim().max(256).optional(),
});

export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  if (!(await wyzieConfigured())) {
    return NextResponse.json({
      enabled: false,
      results: [],
      error:
        "Subtitle search is not configured. Add a free Wyzie API key in Settings → Integrations.",
    });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    languages: url.searchParams.get("languages") ?? undefined,
    imdbId: url.searchParams.get("imdbId") ?? undefined,
    tmdbId: url.searchParams.get("tmdbId") ?? undefined,
    season: url.searchParams.get("season") ?? undefined,
    episode: url.searchParams.get("episode") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    releaseFilter: url.searchParams.get("releaseFilter") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!resolveWyzieMediaId(parsed.data)) {
    return NextResponse.json(
      {
        enabled: true,
        results: [],
        error:
          "No IMDb or TMDB id for this title. Search by title first, or paste tt1234567 / a TMDB id.",
      },
      { status: 400 },
    );
  }

  try {
    const results = await searchWyzieSubtitles(parsed.data);
    return NextResponse.json({
      enabled: true,
      results,
      total: results.length,
    });
  } catch (err) {
    const status =
      err instanceof WyzieRequestError
        ? err.status >= 400 && err.status < 500
          ? 400
          : 502
        : 502;
    return NextResponse.json(
      {
        enabled: true,
        results: [],
        error: err instanceof Error ? err.message : "Subtitle search failed.",
      },
      { status },
    );
  }
}
