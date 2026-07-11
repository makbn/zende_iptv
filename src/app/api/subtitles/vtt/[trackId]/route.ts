import { NextResponse } from "next/server";

import {
  readSubtitleVtt,
  SUBTITLE_CACHE_MAX_AGE_SEC,
} from "@/lib/subtitles/subtitle-cache";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ trackId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { trackId } = await context.params;
  const cached = readSubtitleVtt(trackId);
  if (!cached) {
    return NextResponse.json({ error: "Subtitle expired or not found." }, { status: 404 });
  }

  return new NextResponse(cached.vtt, {
    status: 200,
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": `private, max-age=${SUBTITLE_CACHE_MAX_AGE_SEC}`,
    },
  });
}
