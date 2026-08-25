import "server-only";

export type ImageCacheKind = "logo" | "poster" | "thumbnail";

export type CachedImage = {
  body: Uint8Array;
  contentType: string;
  expiresAt: number;
};

type NamespaceConfig = {
  ttlMs: number;
  maxBytes: number;
};

type NamespaceState = {
  entries: Map<string, CachedImage>;
  inFlight: Map<string, Promise<CachedImage>>;
  bytes: number;
  generation: number;
};

const CONFIG: Record<ImageCacheKind, NamespaceConfig> = {
  logo: { ttlMs: 7 * 24 * 60 * 60 * 1000, maxBytes: 64 * 1024 * 1024 },
  poster: { ttlMs: 7 * 24 * 60 * 60 * 1000, maxBytes: 256 * 1024 * 1024 },
  thumbnail: { ttlMs: 24 * 60 * 60 * 1000, maxBytes: 192 * 1024 * 1024 },
};

const states: Record<ImageCacheKind, NamespaceState> = {
  logo: { entries: new Map(), inFlight: new Map(), bytes: 0, generation: 0 },
  poster: { entries: new Map(), inFlight: new Map(), bytes: 0, generation: 0 },
  thumbnail: { entries: new Map(), inFlight: new Map(), bytes: 0, generation: 0 },
};

function deleteEntry(kind: ImageCacheKind, key: string): void {
  const state = states[kind];
  const value = state.entries.get(key);
  if (!value) return;
  state.bytes -= value.body.byteLength;
  state.entries.delete(key);
}

export function readCachedImage(kind: ImageCacheKind, key: string): CachedImage | null {
  const state = states[kind];
  const value = state.entries.get(key);
  if (!value || Date.now() > value.expiresAt) {
    if (value) deleteEntry(kind, key);
    return null;
  }
  state.entries.delete(key);
  state.entries.set(key, value);
  return value;
}

export async function loadCachedImage(
  kind: ImageCacheKind,
  key: string,
  loader: () => Promise<Omit<CachedImage, "expiresAt">>,
): Promise<{ image: CachedImage; state: "MISS" | "COALESCED" }> {
  const namespace = states[kind];
  const existing = namespace.inFlight.get(key);
  if (existing) return { image: await existing, state: "COALESCED" };

  const generation = namespace.generation;
  const loading = loader().then((value) => ({
    ...value,
    expiresAt: Date.now() + CONFIG[kind].ttlMs,
  }));
  namespace.inFlight.set(key, loading);
  try {
    const image = await loading;
    if (namespace.generation === generation && image.body.byteLength <= CONFIG[kind].maxBytes) {
      while (
        namespace.bytes + image.body.byteLength > CONFIG[kind].maxBytes &&
        namespace.entries.size > 0
      ) {
        const oldest = namespace.entries.keys().next().value as string | undefined;
        if (!oldest) break;
        deleteEntry(kind, oldest);
      }
      deleteEntry(kind, key);
      namespace.entries.set(key, image);
      namespace.bytes += image.body.byteLength;
    }
    return { image, state: "MISS" };
  } finally {
    if (namespace.inFlight.get(key) === loading) namespace.inFlight.delete(key);
  }
}

export function getImageCacheStats(kind: ImageCacheKind) {
  const state = states[kind];
  for (const [key, value] of state.entries) {
    if (value.expiresAt <= Date.now()) deleteEntry(kind, key);
  }
  return {
    entries: state.entries.size,
    bytes: state.bytes,
    inFlight: state.inFlight.size,
    ttlMs: CONFIG[kind].ttlMs,
    maxBytes: CONFIG[kind].maxBytes,
  };
}

export function clearImageCache(kind: ImageCacheKind): void {
  const state = states[kind];
  state.generation += 1;
  state.entries.clear();
  state.inFlight.clear();
  state.bytes = 0;
}

