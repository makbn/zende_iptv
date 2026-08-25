import { NextResponse } from "next/server";

import { isBuiltinPresetId } from "@/config/builtin-playlist-sources";
import { gateApiRequest } from "@/lib/auth/gate-api";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { getPlaylistCatalogMeta } from "@/lib/playlists/catalog-meta";
import { prisma } from "@/lib/db/prisma";
import {
  filterParentalChannels,
  resolveParentalAccess,
} from "@/lib/parental/parental-control-store";

export const runtime = "nodejs";

/** Load persisted parsed catalog for a built-in preset (same machine / share DB across browsers). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ presetId: string }> },
) {
  const gate = await gateApiRequest(_request);
  if ("response" in gate) return gate.response;
  const parental = await resolveParentalAccess(_request, gate);

  const { presetId } = await context.params;
  if (!isBuiltinPresetId(presetId)) {
    return NextResponse.json({ error: "Unknown preset" }, { status: 404 });
  }

  const url = new URL(_request.url);
  if (url.searchParams.get("meta") === "1") {
    const meta = await getPlaylistCatalogMeta(presetId);
    if (!meta) {
      return NextResponse.json({ error: "Unknown preset" }, { status: 404 });
    }
    return NextResponse.json(meta);
  }

  const row = await prisma.playlistCatalogCache.findUnique({
    where: { presetId },
  });
  if (!row) {
    return NextResponse.json({
      channels: [] as M3uChannel[],
      updatedAt: null as number | null,
      channelCount: 0,
    });
  }

  let channels: M3uChannel[] = [];
  try {
    channels = JSON.parse(row.channelsJson) as M3uChannel[];
    if (!Array.isArray(channels)) channels = [];
  } catch {
    channels = [];
  }
  channels = filterParentalChannels(channels, parental.blockedPatterns);

  return NextResponse.json(
    {
      channels,
      updatedAt: row.updatedAt.getTime(),
      channelCount: channels.length,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Cookie, Authorization",
      },
    },
  );
}
