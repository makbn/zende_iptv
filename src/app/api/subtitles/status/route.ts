import { NextResponse } from "next/server";

import { tmdbConfigured } from "@/lib/tmdb/tmdb-config";
import { wyzieConfigured } from "@/lib/subtitles/wyzie-config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    enabled: await wyzieConfigured(),
    tmdbEnabled: await tmdbConfigured(),
    provider: "Wyzie Subs",
  });
}
