import "server-only";

const TTL_MS = 120_000;
const MAX_ENTRIES = 500;

type RootPin = { effectiveUrl: string; expiresAt: number };
const pins = new Map<string, RootPin>();
type RootRefreshLease =
  | {
      kind: "leader";
      complete(effectiveUrl: string | null): void;
    }
  | {
      kind: "wait";
      value: Promise<string | null>;
    };
const refreshes = new Map<string, Promise<string | null>>();

export function getSharedRootPin(rootUrl: string): string | null {
  const pin = pins.get(rootUrl);
  if (!pin || Date.now() > pin.expiresAt) {
    if (pin) pins.delete(rootUrl);
    return null;
  }
  pins.delete(rootUrl);
  pins.set(rootUrl, pin);
  return pin.effectiveUrl;
}

export function rememberSharedRootPin(rootUrl: string, effectiveUrl: string): void {
  if (!/^https?:\/\//i.test(effectiveUrl) || rootUrl === effectiveUrl) return;
  pins.delete(rootUrl);
  while (pins.size >= MAX_ENTRIES) {
    const oldest = pins.keys().next().value as string | undefined;
    if (!oldest) break;
    pins.delete(oldest);
  }
  pins.set(rootUrl, { effectiveUrl, expiresAt: Date.now() + TTL_MS });
}

export function forgetSharedRootPin(rootUrl: string, effectiveUrl?: string): void {
  if (effectiveUrl && pins.get(rootUrl)?.effectiveUrl !== effectiveUrl) return;
  pins.delete(rootUrl);
}

/**
 * Elect exactly one canonical provider-playlist fetch per channel. Some Xtream
 * providers invalidate the previous redirect token whenever this URL is fetched,
 * so concurrent viewers must join the same refresh instead of rotating each
 * other's token.
 */
export function acquireSharedRootRefresh(rootUrl: string): RootRefreshLease {
  const existing = refreshes.get(rootUrl);
  if (existing) return { kind: "wait", value: existing };

  let settled = false;
  let resolveRefresh!: (effectiveUrl: string | null) => void;
  const value = new Promise<string | null>((resolve) => {
    resolveRefresh = resolve;
  });
  refreshes.set(rootUrl, value);

  return {
    kind: "leader",
    complete(effectiveUrl) {
      if (settled) return;
      settled = true;
      refreshes.delete(rootUrl);
      if (effectiveUrl) rememberSharedRootPin(rootUrl, effectiveUrl);
      resolveRefresh(effectiveUrl);
    },
  };
}

export function resetSharedRootPinsForTests(): void {
  clearSharedRootPins();
}

export function getSharedRootPinCacheStats() {
  const now = Date.now();
  for (const [key, pin] of pins) {
    if (pin.expiresAt <= now) pins.delete(key);
  }
  return {
    entries: pins.size,
    refreshesInFlight: refreshes.size,
    ttlMs: TTL_MS,
    maxEntries: MAX_ENTRIES,
  };
}

export function clearSharedRootPins(): void {
  pins.clear();
  refreshes.clear();
}
