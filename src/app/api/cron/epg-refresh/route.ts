import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { assertCronAuthorized } from "@/lib/health/cron-auth";
import { EPG_MAX_IDS } from "@/lib/epg/build-epg-programs";
import { warmEpgCacheForIds } from "@/lib/epg/epg-response-cache";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createServerLogger("api.cron.epgRefresh");

/**
 * Periodic EPG warm-up: loads consolidated guides for distinct `tvgId` values
 * stored on favorites (see UserFavorite.tvgId). Call from cron with CRON_SECRET.
 *
 * Optional: set ZENDE_EPG_WARM_IDS="id1,id2" to always include extra iptv-org ids.
 */
export async function GET(request: Request) {
  const denied = assertCronAuthorized(request);
  if (denied) return denied;

  const envExtra = (process.env.ZENDE_EPG_WARM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const rows = await prisma.userFavorite.findMany({
      where: { tvgId: { not: null } },
      select: { tvgId: true },
    });
    const fromDb = rows
      .map((r) => r.tvgId?.trim())
      .filter((x): x is string => Boolean(x));

    const ids = [
      ...new Set([...fromDb, ...envExtra]),
    ].slice(0, EPG_MAX_IDS);

    if (ids.length === 0) {
      log.info("EPG warm skipped — no tvgIds on favorites or ZENDE_EPG_WARM_IDS");
      return NextResponse.json({
        ok: true,
        warmed: 0,
        message: "No tvgIds to warm",
      });
    }

    const payload = await warmEpgCacheForIds(ids, log);
    log.info("EPG cache warmed", { channelCount: ids.length });
    return NextResponse.json({
      ok: true,
      warmed: ids.length,
      sources: payload.sources,
      fetchedAt: payload.fetchedAt,
    });
  } catch (e) {
    log.error("EPG warm failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "EPG warm failed" }, { status: 500 });
  }
}
