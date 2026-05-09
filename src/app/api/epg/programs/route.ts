import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  EPG_MAX_IDS,
  loadEpgMergeForIds,
  materializeProgramsFromMerge,
} from "@/lib/epg/build-epg-programs";
import {
  getEpgMergeCacheEntry,
  scheduleEpgCacheRefresh,
  setEpgMergeCache,
  shouldRefreshEpgInBackground,
  stableEpgCacheKey,
} from "@/lib/epg/epg-response-cache";

export const runtime = "nodejs";

/** Allow consolidated iptvx scan + guides.json fetch on cold start. */
export const maxDuration = 120;

type Body = {
  ids?: unknown;
};

export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const log = createServerLogger("api.epg.programs");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawIds = body.ids;
  if (!Array.isArray(rawIds) || rawIds.some((x) => typeof x !== "string")) {
    return NextResponse.json(
      { error: "Expected ids: string[]" },
      { status: 400 },
    );
  }

  const ids = [...new Set(rawIds.map((s) => s.trim()).filter(Boolean))].slice(
    0,
    EPG_MAX_IDS,
  );

  if (ids.length === 0) {
    return NextResponse.json({
      programs: {},
      sources: [] as string[],
      fetchedAt: Date.now(),
    });
  }

  ids.sort();
  const cacheKey = stableEpgCacheKey(ids);
  const hit = getEpgMergeCacheEntry(cacheKey);

  if (hit) {
    if (shouldRefreshEpgInBackground(hit.ageMs)) {
      scheduleEpgCacheRefresh(cacheKey, ids, log);
    }
    const payload = await materializeProgramsFromMerge(hit.merge, ids, log);
    return NextResponse.json(payload);
  }

  const merge = await loadEpgMergeForIds(ids, log);
  setEpgMergeCache(cacheKey, merge);
  const payload = await materializeProgramsFromMerge(merge, ids, log);
  return NextResponse.json(payload);
}
