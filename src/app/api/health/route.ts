import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { isThreadfinSyncEnabled } from "@/lib/threadfin/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = createServerLogger("api.health");

let threadfinBootstrapStarted = false;
let homeShelvesWarmStarted = false;
let providerEpgWarmStarted = false;

function kickProviderEpgWarm(): void {
  if (providerEpgWarmStarted) return;
  providerEpgWarmStarted = true;
  void import("@/lib/epg/provider-xmltv-index")
    .then(({ getProviderXmltvIndex }) => getProviderXmltvIndex())
    .then((index) => {
      log.info("provider EPG startup index ready", {
        version: index.version,
        providers: index.providerCount,
        channels: index.guideChannels.size,
        programmes: index.programmeCount,
      });
    })
    .catch((err) => {
      providerEpgWarmStarted = false;
      log.warn("provider EPG startup index failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
}

function kickHomeShelvesWarm(): void {
  if (homeShelvesWarmStarted) return;
  homeShelvesWarmStarted = true;
  void import("@/lib/library/home-shelves-cache")
    .then(({ warmDefaultHomeShelvesIfNeeded }) => warmDefaultHomeShelvesIfNeeded())
    .catch((err) => {
      homeShelvesWarmStarted = false;
      log.warn("home shelves warm failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
}

function kickThreadfinBootstrap(): void {
  if (threadfinBootstrapStarted || !isThreadfinSyncEnabled()) return;
  threadfinBootstrapStarted = true;
  void import("@/lib/threadfin/sync")
    .then(({ syncThreadfin }) => syncThreadfin())
    .then((r) => {
      log.info("threadfin bootstrap sync", {
        ok: r.ok,
        total: r.counts?.total,
        error: r.error,
      });
      // Allow another attempt on next health check if Threadfin was not ready yet.
      if (!r.ok) threadfinBootstrapStarted = false;
    })
    .catch((err) => {
      threadfinBootstrapStarted = false;
      log.warn("threadfin bootstrap sync failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
}

export function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  log.debug("Health check requested", { requestId });
  kickThreadfinBootstrap();
  kickHomeShelvesWarm();
  kickProviderEpgWarm();

  /** Minimal payload — do not echo request IDs or internals (usable behind shared proxies). */
  return NextResponse.json({ ok: true, service: "zende" }, { status: 200 });
}
