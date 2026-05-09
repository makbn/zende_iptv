import "server-only";

/** Avoid a fresh StreamProxySession on every IPTV app retry — reduces DB churn and cookie warm-up races. */

type Entry = { sessionId: string; expiresAt: number };

const cache = new Map<string, Entry>();
const TTL_MS = 120_000;
const MAX_ENTRIES = 400;

export function peekLivePlaybackSession(cacheKey: string): string | null {
  const e = cache.get(cacheKey);
  if (!e || Date.now() > e.expiresAt) {
    if (e) cache.delete(cacheKey);
    return null;
  }
  return e.sessionId;
}

export function rememberLivePlaybackSession(
  cacheKey: string,
  sessionId: string,
): void {
  while (cache.size >= MAX_ENTRIES) {
    const k = cache.keys().next().value;
    if (k === undefined) break;
    cache.delete(k);
  }
  cache.set(cacheKey, { sessionId, expiresAt: Date.now() + TTL_MS });
}

export function forgetLivePlaybackSession(cacheKey: string): void {
  cache.delete(cacheKey);
}
