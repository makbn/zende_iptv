import { NextResponse } from "next/server";

import { isBuiltinPresetId } from "@/config/builtin-playlist-sources";
import { gateApiRequest } from "@/lib/auth/gate-api";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Load persisted parsed catalog for a built-in preset (same machine / share DB across browsers). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ presetId: string }> },
) {
  const gate = await gateApiRequest(_request);
  if ("response" in gate) return gate.response;

  const { presetId } = await context.params;
  if (!isBuiltinPresetId(presetId)) {
    return NextResponse.json({ error: "Unknown preset" }, { status: 404 });
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

  return NextResponse.json({
    channels,
    updatedAt: row.updatedAt.getTime(),
    channelCount: row.channelCount,
  });
}
