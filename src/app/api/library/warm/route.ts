import { NextResponse } from "next/server";

import { BUILTIN_PLAYLIST_SOURCES, isBuiltinPresetId } from "@/config/builtin-playlist-sources";
import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { warmLibraryCatalogIndex } from "@/lib/library/catalog";

export const runtime = "nodejs";

const DEFAULT_PRESET_ID = BUILTIN_PLAYLIST_SOURCES[0]!.presetId;

/** Pre-build catalog index after deploy or playlist refresh (call from healthcheck/entrypoint). */
export async function POST(request: Request) {
  return withApiLogging("api.library.warm", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    const url = new URL(request.url);
    const presetId = url.searchParams.get("presetId") ?? DEFAULT_PRESET_ID;
    if (!isBuiltinPresetId(presetId)) {
      return NextResponse.json({ error: "Unknown preset" }, { status: 404 });
    }

    try {
      const warmed = await warmLibraryCatalogIndex(presetId);
      log.info("catalog index warmed", warmed);
      return NextResponse.json({ ok: true, ...warmed });
    } catch (err) {
      log.error("catalog warm failed", {
        presetId,
        message: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: "Catalog warm failed" }, { status: 500 });
    }
  });
}
