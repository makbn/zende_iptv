import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { assertCronAuthorized } from "@/lib/health/cron-auth";
import { runImdbRatingsJob } from "@/lib/media/imdb-ratings-job";

export const runtime = "nodejs";
export const maxDuration = 21_600;

const log = createServerLogger("api.cron.imdbRatings");

export async function GET(request: Request) {
  const denied = assertCronAuthorized(request);
  if (denied) return denied;

  try {
    const result = await runImdbRatingsJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    log.error("IMDb ratings refresh failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "IMDb ratings refresh failed." }, { status: 500 });
  }
}
