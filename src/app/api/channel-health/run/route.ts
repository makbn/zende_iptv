import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { requireAdmin } from "@/lib/auth/gate-api";
import { assertCronAuthorized } from "@/lib/health/cron-auth";
import { runHealthSweepAll } from "@/lib/health/run-sweep-all";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createServerLogger("api.channelHealth.run");

/** Manual sweep: admin session when auth is on, or cron Bearer when auth is off. */
export async function POST(request: Request) {
  const cfg = await ensureAuthConfigRow();
  const admin = await requireAdmin(request);
  if (!admin.ok) {
    if (!cfg.enabled) {
      const denied = assertCronAuthorized(request);
      if (denied) return denied;
    } else {
      return admin.response;
    }
  }

  try {
    const total = await runHealthSweepAll();
    log.info("Manual health sweep finished", total);
    return NextResponse.json({ ok: true, ...total });
  } catch (e) {
    log.error("Manual health sweep failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
