import "server-only";

import { isBuiltinPresetId } from "@/config/builtin-playlist-sources";
import { loadManualChannelRows } from "@/lib/channels/manual-channels-db";
import { prisma } from "@/lib/db/prisma";

export type PlaylistCatalogMeta = {
  channelCount: number;
  builtinCount: number;
  manualCount: number;
  updatedAt: number | null;
  registered: boolean;
};

/** Lightweight catalog presence check — no channelsJson parse. */
export async function getPlaylistCatalogMeta(
  presetId: string,
): Promise<PlaylistCatalogMeta | null> {
  if (!isBuiltinPresetId(presetId)) return null;

  const [row, manualRows] = await Promise.all([
    prisma.playlistCatalogCache.findUnique({ where: { presetId } }),
    loadManualChannelRows(),
  ]);

  const manualCount = manualRows.length;
  const builtinCount = row?.channelCount ?? 0;

  return {
    channelCount: builtinCount + manualCount,
    builtinCount,
    manualCount,
    updatedAt: row?.updatedAt?.getTime() ?? null,
    registered: builtinCount > 0,
  };
}
