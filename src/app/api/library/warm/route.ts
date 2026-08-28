import { NextResponse } from "next/server";

import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { warmLibraryCatalogIndex } from "@/lib/library/catalog";

export const runtime = "nodejs";

/** Pre-build catalog index after deploy or playlist refresh (call from healthcheck/entrypoint). */
export async function POST(request: Request) {
  return withApiLogging("api.library.warm", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    try {
      const warmed = await warmLibraryCatalogIndex();
      log.info("catalog index warmed", warmed);
      return NextResponse.json({ ok: true, ...warmed });
    } catch (err) {
      log.error("catalog warm failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: "Catalog warm failed" }, { status: 500 });
    }
  });
}
