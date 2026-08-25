import "server-only";

import { createHash } from "node:crypto";

const DEFAULT_FRESH_MS = 4_000;
const MIN_FRESH_MS = 2_000;
const MAX_FRESH_MS = 8_000;
const STALE_GRACE_MS = 45_000;
const MAX_ENTRIES = 500;

export type SharedManifestValue = {
  body: string;
  effectiveUrl: string;
  contentType: string | null;
};

export type SharedManifestSnapshot = SharedManifestValue & {
  expiresAt: number;
  staleUntil: number;
};

type Pending = Promise<SharedManifestSnapshot | null>;
type LeaderLease = {
  kind: "leader";
  commit(value: SharedManifestValue): SharedManifestSnapshot;
  /** Resolve followers with the last playable snapshot, when one exists. */
  fail(): SharedManifestSnapshot | null;
};

export type SharedManifestLease =
  | { kind: "hit"; value: SharedManifestSnapshot }
  | { kind: "wait"; value: Pending }
  | LeaderLease;

const entries = new Map<string, SharedManifestSnapshot>();
const pending = new Map<string, Pending>();

export function sharedManifestCacheKey(channelUrl: string): string {
  return createHash("sha256").update(channelUrl).digest("base64url");
}

function freshnessMs(body: string): number {
  const match = /^#EXT-X-TARGETDURATION\s*:\s*(\d+(?:\.\d+)?)/im.exec(body);
  if (!match?.[1]) return DEFAULT_FRESH_MS;
  const durationMs = Number(match[1]) * 1_000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return DEFAULT_FRESH_MS;
  return Math.max(MIN_FRESH_MS, Math.min(MAX_FRESH_MS, Math.round(durationMs * 0.75)));
}

function prune(now: number): void {
  for (const [key, value] of entries) {
    if (value.staleUntil > now) continue;
    entries.delete(key);
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

/**
 * Returns one channel-wide manifest snapshot. Browser/user/session identity is
 * intentionally absent: authorization happens before the playback session is
 * created, while the upstream media relay is shared infrastructure.
 */
export function acquireSharedManifest(key: string): SharedManifestLease {
  const now = Date.now();
  prune(now);

  const existing = entries.get(key);
  if (existing?.expiresAt && existing.expiresAt > now) {
    entries.delete(key);
    entries.set(key, existing);
    return { kind: "hit", value: existing };
  }

  const inFlight = pending.get(key);
  if (inFlight) return { kind: "wait", value: inFlight };

  let settled = false;
  let resolvePending!: (value: SharedManifestSnapshot | null) => void;
  const promise = new Promise<SharedManifestSnapshot | null>((resolve) => {
    resolvePending = resolve;
  });
  pending.set(key, promise);

  return {
    kind: "leader",
    commit(value) {
      const committedAt = Date.now();
      const snapshot: SharedManifestSnapshot = {
        ...value,
        expiresAt: committedAt + freshnessMs(value.body),
        staleUntil: committedAt + STALE_GRACE_MS,
      };
      entries.delete(key);
      entries.set(key, snapshot);
      if (!settled) {
        settled = true;
        pending.delete(key);
        resolvePending(snapshot);
      }
      return snapshot;
    },
    fail() {
      const stale = entries.get(key);
      const fallback = stale && stale.staleUntil > Date.now() ? stale : null;
      if (!settled) {
        settled = true;
        pending.delete(key);
        resolvePending(fallback);
      }
      return fallback;
    },
  };
}

export function getSharedManifestCacheStats() {
  prune(Date.now());
  return {
    entries: entries.size,
    inFlight: pending.size,
    staleGraceMs: STALE_GRACE_MS,
    maxEntries: MAX_ENTRIES,
  };
}

export function clearSharedManifestCache(): void {
  entries.clear();
  pending.clear();
}

export function resetSharedManifestCacheForTests(): void {
  clearSharedManifestCache();
}
