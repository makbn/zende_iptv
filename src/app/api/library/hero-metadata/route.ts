import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { getCachedMediaMetadata } from "@/lib/media/media-metadata-service";

export const runtime = "nodejs";

const querySchema = z.object({
  title: z.string().trim().min(1).max(300),
  mediaType: z.enum(["movie", "tv"]),
  channelId: z.string().trim().min(1).max(200).optional(),
  seriesId: z.string().trim().min(1).max(200).optional(),
  imdbId: z.string().trim().regex(/^tt\d+$/i).optional(),
  year: z.string().trim().regex(/^(19|20)\d{2}$/).optional(),
});

function fallbackMediaKey(mediaType: "movie" | "tv", title: string, year?: string): string {
  const identity = `${mediaType}\0${title.toLowerCase()}\0${year ?? ""}`;
  return `home:${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

/** Lightweight hero details using the same weekly metadata cache as movie/show pages. */
export async function GET(request: Request) {
  return withApiLogging("api.library.heroMetadata", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      title: url.searchParams.get("title") ?? undefined,
      mediaType: url.searchParams.get("mediaType") ?? undefined,
      channelId: url.searchParams.get("channelId") ?? undefined,
      seriesId: url.searchParams.get("seriesId") ?? undefined,
      imdbId: url.searchParams.get("imdbId") ?? undefined,
      year: url.searchParams.get("year") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid hero metadata query." }, { status: 400 });
    }

    const input = parsed.data;
    const mediaKey = input.channelId
      ? `channel:${input.channelId}`
      : input.seriesId
        ? `series:${input.seriesId}`
        : input.imdbId
          ? `imdb:${input.imdbId.toLowerCase()}`
          : fallbackMediaKey(input.mediaType, input.title, input.year);

    try {
      const metadata = await getCachedMediaMetadata({
        mediaKey,
        providerChannelId: input.channelId,
        mediaType: input.mediaType,
        title: input.title,
        year: input.year,
        ...(input.imdbId ? { portalInfo: { imdb_id: input.imdbId } } : {}),
      });
      return NextResponse.json(
        { metadata },
        {
          headers: {
            "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
            Vary: "Cookie, Authorization",
          },
        },
      );
    } catch (error) {
      log.warn("hero metadata unavailable", {
        mediaKey,
        message: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ metadata: null });
    }
  });
}
