import "server-only";

import { createServerLogger } from "@/core/logging/server";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import {
  canModifyManualChannelEntry,
  effectiveOwnerForNewManualEntry,
  normalizeManualChannel,
  type ManualChannelsGate,
  type StoredManualChannelEntry,
} from "@/lib/channels/manual-channels-policy";
import {
  loadManualChannelRows,
  saveManualChannelRows,
} from "@/lib/channels/manual-channels-db";
import { isAllowedManualStreamUrl } from "@/lib/channels/manual-stream-url";
import { redactStreamUrlForLog } from "@/lib/stream/redact-stream-url";

const log = createServerLogger("lib.channels.persist");

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Upsert many channels into the server manual store (no client round-trip). */
export async function persistManualChannelsBatch(
  incoming: M3uChannel[],
  gate: ManualChannelsGate,
): Promise<{ processed: number; skipped: number; total: number }> {
  const started = Date.now();
  log.info("persist batch start", { incoming: incoming.length });

  const existing = await loadManualChannelRows();
  const byUrl = new Map(existing.map((e) => [e.channel.url.trim(), e]));
  let processed = 0;
  let skipped = 0;
  let skippedInvalidUrl = 0;
  let skippedDenied = 0;

  for (const channel of incoming) {
    const chNorm = normalizeManualChannel(channel);
    if (!chNorm.name || !isAllowedManualStreamUrl(chNorm.url)) {
      skipped++;
      skippedInvalidUrl++;
      if (skippedInvalidUrl <= 3) {
        log.warn("persist skip: invalid url or name", {
          name: chNorm.name,
          url: redactStreamUrlForLog(chNorm.url),
          contentType: chNorm.contentType,
        });
      }
      continue;
    }
    const prev = byUrl.get(chNorm.url.trim());
    if (prev) {
      if (!canModifyManualChannelEntry(prev, gate)) {
        skipped++;
        skippedDenied++;
        continue;
      }
      prev.channel = chNorm;
      processed++;
      continue;
    }
    const row: StoredManualChannelEntry = {
      id: newId(),
      channel: chNorm,
      addedAt: Date.now(),
      addedByUserId: effectiveOwnerForNewManualEntry(gate),
    };
    existing.unshift(row);
    byUrl.set(chNorm.url.trim(), row);
    processed++;
  }

  if (processed > 0) {
    await saveManualChannelRows(existing);
  }

  log.info("persist batch done", {
    incoming: incoming.length,
    processed,
    skipped,
    skippedInvalidUrl,
    skippedDenied,
    total: existing.length,
    elapsedMs: Date.now() - started,
  });

  return { processed, skipped, total: existing.length };
}
