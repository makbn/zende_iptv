import "server-only";

import {
  parseManualEntriesLoose,
  type StoredManualChannelEntry,
} from "@/lib/channels/manual-channels-policy";
import { invalidateXtreamCatalogCache } from "@/lib/iptv/aggregated-channels";
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
}
