import { NextResponse } from "next/server";

import {
  getBuiltinPlaylistSource,
  isBuiltinPresetId,
} from "@/config/builtin-playlist-sources";
import { createServerLogger } from "@/core/logging/server";
import { parseM3u } from "@/core/playlist/m3u-parse";
import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
import { invalidateXtreamCatalogCache } from "@/lib/iptv/aggregated-channels";
import { invalidateLibraryCatalogCache, warmLibraryCatalogIndex } from "@/lib/library/catalog";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const log = createServerLogger("api.playlists.catalogRefresh");

/**
 * Re-download the allowlisted M3U, parse on the server, and persist to SQLite.
 * Avoids shipping huge JSON bodies from the browser on PUT.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ presetId: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;

  const { presetId } = await context.params;
  if (!isBuiltinPresetId(presetId)) {
    return NextResponse.json({ error: "Unknown preset" }, { status: 404 });
  }

  const source = getBuiltinPlaylistSource(presetId);
  if (!source) {
    return NextResponse.json({ error: "Unknown preset" }, { status: 404 });
  }

  try {
    const upstream = await fetch(source.m3uUrl, {
      headers: {
        "User-Agent": "Zende/0.1 (catalog refresh; +https://github.com)",
        Accept: "audio/x-mpegurl, application/vnd.apple.mpegurl, */*",
      },
    });

    if (!upstream.ok) {
      log.warn("Upstream playlist fetch failed", {
        presetId,
        status: upstream.status,
      });
      return NextResponse.json(
        { error: "Upstream playlist unavailable" },
        { status: 502 },
      );
    }

    const text = await upstream.text();
    const parsed = parseM3u(text);
    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Playlist parsed with zero channels." },
        { status: 422 },
      );
    }

    const channelsJson = JSON.stringify(parsed);

    await prisma.playlistCatalogCache.upsert({
      where: { presetId },
      create: {
        presetId,
        channelsJson,
        channelCount: parsed.length,
      },
      update: {
        channelsJson,
        channelCount: parsed.length,
      },
    });
    invalidateXtreamCatalogCache();
    invalidateLibraryCatalogCache();

    const warmed = await warmLibraryCatalogIndex();

    const row = await prisma.playlistCatalogCache.findUniqueOrThrow({
      where: { presetId },
    });

    log.info("Catalog persisted", {
      presetId,
      channelCount: parsed.length,
      indexElapsedMs: warmed.elapsedMs,
    });

    return NextResponse.json({
      ok: true,
      channelCount: parsed.length,
      updatedAt: row.updatedAt.getTime(),
      indexWarmMs: warmed.elapsedMs,
    });
  } catch (e) {
    log.error("Catalog refresh failed", {
      presetId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Refresh failed" }, { status: 502 });
  }
}
