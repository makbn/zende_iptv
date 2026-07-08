import "server-only";

import {
  parseManualEntriesLoose,
  type StoredManualChannelEntry,
} from "@/lib/channels/manual-channels-policy";
import { invalidateXtreamCatalogCache } from "@/lib/iptv/aggregated-channels";
import {
  invalidateLibraryCatalogCache,
  warmLibraryCatalogIndex,
} from "@/lib/library/catalog";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { prisma } from "@/lib/db/prisma";

const MANUAL_STORE_ID = 1;

export async function loadManualChannelRows(): Promise<StoredManualChannelEntry[]> {
  const row = await prisma.manualChannelsStore.findUnique({ where: { id: MANUAL_STORE_ID } });
  if (!row) return [];
  try {
    const raw = JSON.parse(row.entriesJson) as unknown;
    return parseManualEntriesLoose(raw);
  } catch {
    return [];
  }
}

export async function saveManualChannelRows(rows: StoredManualChannelEntry[]): Promise<void> {
  await prisma.manualChannelsStore.upsert({
    where: { id: MANUAL_STORE_ID },
    create: { id: MANUAL_STORE_ID, entriesJson: JSON.stringify(rows) },
    update: { entriesJson: JSON.stringify(rows) },
  });
  invalidateXtreamCatalogCache();
  invalidateLibraryCatalogCache();
  const presetId = BUILTIN_PLAYLIST_SOURCES[0]?.presetId;
  if (presetId) {
    void warmLibraryCatalogIndex(presetId).catch(() => {
      /* non-fatal — next request rebuilds */
    });
  }
}
