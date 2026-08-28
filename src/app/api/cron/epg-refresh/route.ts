import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { assertCronAuthorized } from "@/lib/health/cron-auth";
import { EPG_MAX_IDS } from "@/lib/epg/build-epg-programs";
import { warmEpgCacheForIds } from "@/lib/epg/epg-response-cache";
import { refreshProviderXmltvIndex } from "@/lib/epg/provider-xmltv-index";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createServerLogger("api.cron.epgRefresh");

/**
 * Hourly EPG refresh: atomically replaces the provider search index, then
 * warms the smaller public-guide cache for favorited `tvgId` values.
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
    const providerRefresh = refreshProviderXmltvIndex();
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
      const providerIndex = await providerRefresh;
      log.info("provider EPG index refreshed; public guide warm skipped", {
        version: providerIndex.version,
        providers: providerIndex.providerCount,
        programmes: providerIndex.programmeCount,
      });
      return NextResponse.json({
        ok: true,
        warmed: 0,
        providerIndex: {
          version: providerIndex.version,
          providers: providerIndex.providerCount,
          channels: providerIndex.guideChannels.size,
          programmes: providerIndex.programmeCount,
        },
        message: "Provider guide indexed; no public tvgIds to warm",
      });
    }

    const [providerIndex, payload] = await Promise.all([
      providerRefresh,
      warmEpgCacheForIds(ids, log),
    ]);
    log.info("EPG indexes warmed", {
      channelCount: ids.length,
      providerVersion: providerIndex.version,
    });
    return NextResponse.json({
      ok: true,
      warmed: ids.length,
      providerIndex: {
        version: providerIndex.version,
        providers: providerIndex.providerCount,
        channels: providerIndex.guideChannels.size,
        programmes: providerIndex.programmeCount,
      },
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
