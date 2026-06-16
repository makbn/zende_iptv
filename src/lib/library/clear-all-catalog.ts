import "server-only";

import type { ManualChannelsGate } from "@/lib/channels/manual-channels-policy";
import {
  canModifyManualChannelEntry,
  type StoredManualChannelEntry,
} from "@/lib/channels/manual-channels-policy";
import { loadManualChannelRows, saveManualChannelRows } from "@/lib/channels/manual-channels-db";
import { invalidateXtreamCatalogCache } from "@/lib/iptv/aggregated-channels";
import { invalidateLibraryCatalogCache } from "@/lib/library/catalog";
import { clearXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import { prisma } from "@/lib/db/prisma";

export type ClearAllCatalogResult = {
  manualRemoved: number;
  manualRemaining: number;
  builtinPresetsCleared: number;
  builtinChannelsCleared: number;
};

/** Wipe manual imports and cached built-in playlist catalogs (e.g. World channel index). */
export async function clearAllChannelCatalog(input: {
  gate: ManualChannelsGate;
  clearBuiltinCatalog: boolean;
}): Promise<ClearAllCatalogResult> {
  const rows = await loadManualChannelRows();
  const isAdmin =
    input.gate.authEnabled && input.gate.user.role === "ADMIN";
  const remaining =
    isAdmin || !input.gate.authEnabled
      ? []
      : rows.filter((row) => !canModifyManualChannelEntry(row, input.gate));
  const manualRemoved = rows.length - remaining.length;

  if (manualRemoved > 0) {
    await saveManualChannelRows(remaining);
    if (remaining.length === 0) {
      await clearXtreamPortalCredentials();
    }
  }

  let builtinPresetsCleared = 0;
  let builtinChannelsCleared = 0;
  if (input.clearBuiltinCatalog) {
    const cached = await prisma.playlistCatalogCache.findMany({
      select: { channelCount: true },
    });
    builtinChannelsCleared = cached.reduce((sum, row) => sum + row.channelCount, 0);
    const deleted = await prisma.playlistCatalogCache.deleteMany({});
    builtinPresetsCleared = deleted.count;
    invalidateXtreamCatalogCache();
    invalidateLibraryCatalogCache();
  }

  return {
    manualRemoved,
    manualRemaining: remaining.length,
    builtinPresetsCleared,
    builtinChannelsCleared,
  };
}

export async function getCatalogInventoryCounts(): Promise<{
  manualTotal: number;
  builtinChannelTotal: number;
  builtinPresetCount: number;
}> {
  const [manualRows, builtinRows] = await Promise.all([
    loadManualChannelRows(),
    prisma.playlistCatalogCache.findMany({ select: { channelCount: true } }),
  ]);
  return {
    manualTotal: manualRows.length,
    builtinChannelTotal: builtinRows.reduce((sum, row) => sum + row.channelCount, 0),
    builtinPresetCount: builtinRows.length,
  };
}
