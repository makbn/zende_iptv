import { NextResponse } from "next/server";

import { readSubtitleVtt } from "@/lib/subtitles/subtitle-cache";

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
      "Cache-Control": "private, max-age=3600",
    },
  });
}
