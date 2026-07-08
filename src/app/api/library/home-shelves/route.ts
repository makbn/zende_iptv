import { NextResponse } from "next/server";

import { BUILTIN_PLAYLIST_SOURCES, isBuiltinPresetId } from "@/config/builtin-playlist-sources";
import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { queryHomeCatalogShelves } from "@/lib/library/catalog";

export const runtime = "nodejs";

const DEFAULT_PRESET_ID = BUILTIN_PLAYLIST_SOURCES[0]!.presetId;

/** Home rails in one indexed query (discover + recommended movies/series). */
export async function GET(request: Request) {
  return withApiLogging("api.library.homeShelves", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    const url = new URL(request.url);
    const presetId = url.searchParams.get("presetId") ?? DEFAULT_PRESET_ID;
    if (!isBuiltinPresetId(presetId)) {
      return NextResponse.json({ error: "Unknown preset" }, { status: 404 });
    }

    const language = url.searchParams.get("language");
    const discoverLimit = Math.min(
      120,
      Math.max(1, Number.parseInt(url.searchParams.get("discoverLimit") ?? "36", 10) || 36),
    );
    const movieLimit = Math.min(
      60,
      Math.max(1, Number.parseInt(url.searchParams.get("movieLimit") ?? "18", 10) || 18),
    );
    const seriesLimit = Math.min(
      60,
      Math.max(1, Number.parseInt(url.searchParams.get("seriesLimit") ?? "18", 10) || 18),
    );

    const started = Date.now();
    try {
      const shelves = await queryHomeCatalogShelves({
        presetId,
        language: language?.trim() ? language.trim().toLowerCase() : null,
        discoverLimit,
        movieLimit,
        seriesLimit,
      });
      log.info("home shelves ok", {
        presetId,
        discover: shelves.discover.channels.length,
        movies: shelves.movies.channels.length,
        series: shelves.series.channels.length,
        elapsedMs: Date.now() - started,
      });
      return NextResponse.json(shelves);
    } catch (err) {
      log.error("home shelves failed", {
        presetId,
        elapsedMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: "Could not load home shelves." }, { status: 500 });
    }
  });
}
