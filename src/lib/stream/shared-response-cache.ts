import "server-only";

import { createHash } from "node:crypto";

const CACHE_TTL_MS = 120_000;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
export const MAX_CACHE_ITEM_BYTES = 32 * 1024 * 1024;

export type SharedStreamResponse = {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  expiresAt: number;
};

type Pending = Promise<SharedStreamResponse | null>;
type LeaderLease = {
  kind: "leader";
  commit(value: Omit<SharedStreamResponse, "expiresAt">): void;
  fail(): void;
};

export type SharedStreamCacheLease =
  | { kind: "hit"; value: SharedStreamResponse }
  | { kind: "wait"; value: Pending }
  | LeaderLease;

const entries = new Map<string, SharedStreamResponse>();
const pending = new Map<string, Pending>();
let cacheBytes = 0;
let generation = 0;

function deleteEntry(key: string): void {
  const existing = entries.get(key);
  if (!existing) return;
  cacheBytes -= existing.body.byteLength;
  entries.delete(key);
}

function pruneExpired(now: number): void {
  for (const [key, value] of entries) {
    if (value.expiresAt > now) continue;
    deleteEntry(key);
  }
}

function makeRoom(requiredBytes: number): void {
  while (cacheBytes + requiredBytes > MAX_CACHE_BYTES && entries.size > 0) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    deleteEntry(oldest);
  }
}

export function sharedStreamCacheKey(input: {
  channelUrl: string;
  url: string;
  resourceKind: "segment" | "key" | "other";
  range?: string | null;
}): string {
  let resourceIdentity = input.url;
  try {
    const parsed = new URL(input.url);
    const filename = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    // Xtream rotating-token paths contain a token and per-segment random folder,
    // but the final channel_sequence filename is stable for the media instant.
    if (
      input.resourceKind === "segment" &&
      /^[^/]+_\d+\.(?:ts|m4s|aac|ac3)$/i.test(filename)
    ) {
      resourceIdentity = filename.toLowerCase();
    }
  } catch {
    /* retain exact URL for unknown resource shapes */
  }

  return createHash("sha256")
    .update(input.channelUrl)
    .update("\0")
    .update(input.resourceKind)
    .update("\0")
    .update(resourceIdentity)
    .update("\0")
    .update(input.range ?? "")
    .digest("base64url");
}

/**
 * Returns an existing cached response, joins the current upstream request, or
 * elects this caller as the one upstream leader for the cache key.
 */
export function acquireSharedStreamResponse(key: string): SharedStreamCacheLease {
  const now = Date.now();
  pruneExpired(now);

  const hit = entries.get(key);
  if (hit) {
    // Map insertion order is our bounded LRU order.
    entries.delete(key);
    entries.set(key, hit);
    return { kind: "hit", value: hit };
  }

  const inFlight = pending.get(key);
  if (inFlight) return { kind: "wait", value: inFlight };

  let settled = false;
  let resolvePending!: (value: SharedStreamResponse | null) => void;
  const promise = new Promise<SharedStreamResponse | null>((resolve) => {
    resolvePending = resolve;
  });
  pending.set(key, promise);
  const leaseGeneration = generation;

  return {
    kind: "leader",
    commit(value) {
      if (settled) return;
      settled = true;
      pending.delete(key);
      if (value.body.byteLength <= 0 || value.body.byteLength > MAX_CACHE_ITEM_BYTES) {
        resolvePending(null);
        return;
      }
      if (leaseGeneration !== generation) {
        resolvePending(null);
        return;
      }
      makeRoom(value.body.byteLength);
      const stored: SharedStreamResponse = {
        ...value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      entries.set(key, stored);
      cacheBytes += value.body.byteLength;
      resolvePending(stored);
    },
    fail() {
      if (settled) return;
      settled = true;
      pending.delete(key);
      resolvePending(null);
    },
  };
}

/** Read a tee'd response branch without allowing one cache item to exhaust memory. */
export async function readSharedCacheBody(
  body: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_CACHE_ITEM_BYTES) {
        await reader.cancel("shared stream cache item too large");
        throw new Error("Shared stream cache item exceeded the per-item limit.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

export function getSharedStreamCacheStats() {
  pruneExpired(Date.now());
  return {
    entries: entries.size,
    bytes: cacheBytes,
    inFlight: pending.size,
    ttlMs: CACHE_TTL_MS,
    maxBytes: MAX_CACHE_BYTES,
  };
}

export function clearSharedStreamCache(): void {
  generation += 1;
  entries.clear();
  pending.clear();
  cacheBytes = 0;
}

export function resetSharedStreamCacheForTests(): void {
  clearSharedStreamCache();
}
