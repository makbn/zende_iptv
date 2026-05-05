import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { assertCronAuthorized } from "@/lib/health/cron-auth";
import { runHealthSweepAll } from "@/lib/health/run-sweep-all";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createServerLogger("api.cron.nightlyHealth");

export async function GET(request: Request) {
  const denied = assertCronAuthorized(request);
  if (denied) return denied;

  try {
    const total = await runHealthSweepAll();
    log.info("Nightly health job finished", total);
    return NextResponse.json({ ok: true, ...total });
  } catch (e) {
    log.error("Nightly health failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
