import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

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

// ─── disk persistence ─────────────────────────────────────────────────────────

/**
 * Root for persisted image cache.
 * Docker: prefer `/data/image-cache` (same volume as SQLite). Local: `<cwd>/data/image-cache`.
 */
function resolveImageCacheRoot(): string {
  const fromEnv = process.env.ZENDE_IMAGE_CACHE_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
  }
  if (process.env.ZENDE_RECORDINGS_DIR?.trim().startsWith("/data")) {
    return "/data/image-cache";
  }
  if (process.env.DATABASE_URL?.includes("/data/")) {
    return "/data/image-cache";
  }
  return path.join(process.cwd(), "data", "image-cache");
}

const DISK_ROOT = resolveImageCacheRoot();
let ensuredDirs = false;

function ensureDirsSync() {
  if (ensuredDirs) return;
  for (const kind of ["logo", "poster", "thumbnail"] as const) {
    fs.mkdirSync(path.join(DISK_ROOT, kind), { recursive: true });
  }
  ensuredDirs = true;
}

function hashKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

function diskPath(kind: ImageCacheKind, url: string): string {
  return path.join(DISK_ROOT, kind, `${hashKey(url)}.bin`);
}

/** Disk entry: 4-byte content-type length + content-type + 8-byte expiresAt + image body. */
function writeDiskEntry(kind: ImageCacheKind, url: string, entry: CachedImage): void {
  try {
    ensureDirsSync();
    const ctBytes = Buffer.from(entry.contentType, "utf8");
    const header = Buffer.alloc(4 + ctBytes.length + 8);
    header.writeUInt32BE(ctBytes.length, 0);
    ctBytes.copy(header, 4);
    // Write expiresAt as two 32-bit values (no BigInt needed for ms timestamps until ~2106)
    header.writeUInt32BE(Math.floor(entry.expiresAt / 0x100000000), 4 + ctBytes.length);
    header.writeUInt32BE(entry.expiresAt >>> 0, 4 + ctBytes.length + 4);
    const filePath = diskPath(kind, url);
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    const fd = fs.openSync(tmpPath, "w");
    try {
      fs.writeSync(fd, header);
      fs.writeSync(fd, entry.body);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, filePath);
  } catch {
    /* best-effort: disk write failures don't break the in-memory cache */
  }
}

function readDiskEntry(kind: ImageCacheKind, url: string): CachedImage | null {
  try {
    const filePath = diskPath(kind, url);
    const buf = fs.readFileSync(filePath);
    if (buf.length < 12) return null;
    const ctLen = buf.readUInt32BE(0);
    if (buf.length < 4 + ctLen + 8) return null;
    const contentType = buf.subarray(4, 4 + ctLen).toString("utf8");
    const expiresHi = buf.readUInt32BE(4 + ctLen);
    const expiresLo = buf.readUInt32BE(4 + ctLen + 4);
    const expiresAt = expiresHi * 0x100000000 + expiresLo;
    if (Date.now() > expiresAt) {
      fs.unlinkSync(filePath);
      return null;
    }
    const body = new Uint8Array(buf.buffer, buf.byteOffset + 4 + ctLen + 8, buf.length - 4 - ctLen - 8);
    return { body, contentType, expiresAt };
  } catch {
    return null;
  }
}

function deleteDiskEntry(kind: ImageCacheKind, url: string): void {
  try {
    fs.unlinkSync(diskPath(kind, url));
  } catch {
    /* ignore */
  }
}

// ─── in-memory cache ──────────────────────────────────────────────────────────

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
  if (value) {
    if (Date.now() > value.expiresAt) {
      deleteEntry(kind, key);
    } else {
      // LRU touch: move to end
      state.entries.delete(key);
      state.entries.set(key, value);
      return value;
    }
  }

  // Memory miss — try disk
  const fromDisk = readDiskEntry(kind, key);
  if (!fromDisk) return null;

  // Promote into memory (evict if needed)
  if (fromDisk.body.byteLength <= CONFIG[kind].maxBytes) {
    while (
      state.bytes + fromDisk.body.byteLength > CONFIG[kind].maxBytes &&
      state.entries.size > 0
    ) {
      const oldest = state.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      deleteEntry(kind, oldest);
    }
    state.entries.set(key, fromDisk);
    state.bytes += fromDisk.body.byteLength;
  }

  return fromDisk;
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
    // Persist to disk (fire-and-forget)
    writeDiskEntry(kind, key, image);
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
  // Clear disk cache for this namespace
  try {
    const dir = path.join(DISK_ROOT, kind);
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (name.endsWith(".bin")) {
        fs.unlinkSync(path.join(dir, name));
      }
    }
  } catch {
    /* directory may not exist yet */
  }
}

/** Best-effort cleanup of expired on-disk entries. */
export async function pruneExpiredImageCache(): Promise<void> {
  ensureDirsSync();
  for (const kind of ["logo", "poster", "thumbnail"] as const) {
    const dir = path.join(DISK_ROOT, kind);
    try {
      const files = await fsPromises.readdir(dir);
      for (const name of files) {
        if (!name.endsWith(".bin")) continue;
        const filePath = path.join(dir, name);
        try {
          const buf = await fsPromises.readFile(filePath);
          if (buf.length < 12) {
            await fsPromises.unlink(filePath);
            continue;
          }
          const ctLen = buf.readUInt32BE(0);
          if (buf.length < 4 + ctLen + 8) {
            await fsPromises.unlink(filePath);
            continue;
          }
          const expiresHi = buf.readUInt32BE(4 + ctLen);
          const expiresLo = buf.readUInt32BE(4 + ctLen + 4);
          const expiresAt = expiresHi * 0x100000000 + expiresLo;
          if (Date.now() > expiresAt) {
            await fsPromises.unlink(filePath);
          }
        } catch {
          /* ignore individual file errors */
        }
      }
    } catch {
      /* directory missing */
    }
  }
}
