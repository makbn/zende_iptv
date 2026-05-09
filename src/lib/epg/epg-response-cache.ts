import "server-only";

import type { ILogger } from "@/core/logging/types";
import {
  loadEpgMergeForIds,
  materializeProgramsFromMerge,
  type EpgMergeForIds,
  type EpgProgramsPayload,
} from "@/lib/epg/build-epg-programs";

/** Serve merged XMLTV without re-downloading for this long. */
const FRESH_MS = 10 * 60 * 1000;
/** Drop cache entries older than this (must refresh blocking). */
const STALE_MS = 60 * 60 * 1000;
const MAX_KEYS = 48;

const cache = new Map<string, { merge: EpgMergeForIds; storedAt: number }>();
const inflight = new Map<string, Promise<void>>();

function trimCache(): void {
  while (cache.size > MAX_KEYS) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [k, v] of cache) {
      if (v.storedAt < oldest) {
        oldest = v.storedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
    else break;
  }
}

export function stableEpgCacheKey(sortedIds: string[]): string {
  return sortedIds.join("\0");
}

export function getEpgMergeCacheEntry(
  key: string,
): { merge: EpgMergeForIds; ageMs: number } | null {
  const e = cache.get(key);
  if (!e) return null;
  const ageMs = Date.now() - e.merge.fetchedAt;
  if (ageMs > STALE_MS) {
    cache.delete(key);
    return null;
  }
  return { merge: e.merge, ageMs };
}

export function setEpgMergeCache(key: string, merge: EpgMergeForIds): void {
  cache.set(key, { merge, storedAt: Date.now() });
  trimCache();
}

export function scheduleEpgCacheRefresh(
  key: string,
  ids: string[],
  log: ILogger,
): void {
  if (inflight.has(key)) return;
  const job = loadEpgMergeForIds(ids, log)
    .then((merge) => {
      setEpgMergeCache(key, merge);
    })
    .catch(() => {
      /* logged in load */
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, job);
}

export function shouldRefreshEpgInBackground(ageMs: number): boolean {
  return ageMs >= FRESH_MS;
}

/** Pre-warm from cron: blocking fetch + cache; returns current now/next for logging. */
export async function warmEpgCacheForIds(
  ids: string[],
  log: ILogger,
): Promise<EpgProgramsPayload> {
  const sorted = [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
  const key = stableEpgCacheKey(sorted);
  const merge = await loadEpgMergeForIds(sorted, log);
  setEpgMergeCache(key, merge);
  return materializeProgramsFromMerge(merge, sorted, log);
}
