import "server-only";

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import type { SubtitleSearchQuery, SubtitleSearchResult } from "@/lib/subtitles/types";
import { subtitleTextToVtt } from "@/lib/subtitles/srt-to-vtt";

/** Keep loaded VTT tracks and Wyzie search results for at least a week. */
export const SUBTITLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SUBTITLE_CACHE_MAX_AGE_SEC = Math.floor(SUBTITLE_CACHE_TTL_MS / 1000);

type CachedSubtitle = {
  vtt: string;
  label: string;
  language: string;
  expiresAt: number;
  sourceUrl?: string;
};

type CachedSearch = {
  results: SubtitleSearchResult[];
  expiresAt: number;
};

/**
 * Root for persisted subtitle cache.
 * Docker: prefer `/data/subtitles` (same volume as SQLite). Local: `<cwd>/data/subtitles`.
 */
function resolveSubtitlesRoot(): string {
  const fromEnv = process.env.ZENDE_SUBTITLES_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
  }
  if (process.env.ZENDE_RECORDINGS_DIR?.trim().startsWith("/data")) {
    return "/data/subtitles";
  }
  if (process.env.DATABASE_URL?.includes("/data/")) {
    return "/data/subtitles";
  }
  return path.join(process.cwd(), "data", "subtitles");
}

const ROOT = resolveSubtitlesRoot();
const TRACKS_DIR = path.join(ROOT, "tracks");
const SEARCHES_DIR = path.join(ROOT, "searches");
const SOURCE_INDEX = path.join(ROOT, "source-index.json");

const memoryTracks = new Map<string, CachedSubtitle>();
const memorySearches = new Map<string, CachedSearch>();
let sourceIndex: Record<string, string> | null = null;
let ensuredDirs = false;

function ensureDirsSync() {
  if (ensuredDirs) return;
  fs.mkdirSync(TRACKS_DIR, { recursive: true });
  fs.mkdirSync(SEARCHES_DIR, { recursive: true });
  ensuredDirs = true;
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function trackPath(id: string): string {
  return path.join(TRACKS_DIR, `${id}.json`);
}

function searchPath(key: string): string {
  return path.join(SEARCHES_DIR, `${key}.json`);
}

function isFresh(expiresAt: number): boolean {
  return expiresAt > Date.now();
}

function loadSourceIndex(): Record<string, string> {
  if (sourceIndex) return sourceIndex;
  ensureDirsSync();
  try {
    const raw = fs.readFileSync(SOURCE_INDEX, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    sourceIndex = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    sourceIndex = {};
  }
  return sourceIndex;
}

function saveSourceIndex() {
  ensureDirsSync();
  if (!sourceIndex) return;
  fs.writeFileSync(SOURCE_INDEX, JSON.stringify(sourceIndex), "utf8");
}

function readTrackFile(id: string): CachedSubtitle | null {
  try {
    const raw = fs.readFileSync(trackPath(id), "utf8");
    const parsed = JSON.parse(raw) as CachedSubtitle;
    if (!parsed?.vtt || typeof parsed.expiresAt !== "number") return null;
    if (!isFresh(parsed.expiresAt)) {
      fs.unlinkSync(trackPath(id));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeTrackFile(id: string, entry: CachedSubtitle) {
  ensureDirsSync();
  fs.writeFileSync(trackPath(id), JSON.stringify(entry), "utf8");
}

function pruneMemory() {
  const now = Date.now();
  for (const [key, value] of memoryTracks) {
    if (value.expiresAt <= now) memoryTracks.delete(key);
  }
  for (const [key, value] of memorySearches) {
    if (value.expiresAt <= now) memorySearches.delete(key);
  }
}

export function storeSubtitleVtt(input: {
  label: string;
  language: string;
  text: string;
  fileName?: string;
  sourceUrl?: string;
}): string {
  pruneMemory();
  ensureDirsSync();

  const sourceUrl = input.sourceUrl?.trim();
  if (sourceUrl) {
    const index = loadSourceIndex();
    const existingId = index[hashKey(sourceUrl)];
    if (existingId) {
      const existing = readSubtitleVtt(existingId);
      if (existing) {
        // Refresh TTL on reuse so active tracks stay warm for another week.
        const refreshed: CachedSubtitle = {
          ...existing,
          label: input.label,
          language: input.language,
          expiresAt: Date.now() + SUBTITLE_CACHE_TTL_MS,
          sourceUrl,
        };
        memoryTracks.set(existingId, refreshed);
        writeTrackFile(existingId, refreshed);
        return existingId;
      }
    }
  }

  const id = randomBytes(12).toString("hex");
  const vtt = subtitleTextToVtt(input.text, input.fileName);
  const entry: CachedSubtitle = {
    vtt,
    label: input.label,
    language: input.language,
    expiresAt: Date.now() + SUBTITLE_CACHE_TTL_MS,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
  memoryTracks.set(id, entry);
  writeTrackFile(id, entry);

  if (sourceUrl) {
    const index = loadSourceIndex();
    index[hashKey(sourceUrl)] = id;
    saveSourceIndex();
  }

  return id;
}

export function readSubtitleVtt(id: string): CachedSubtitle | null {
  pruneMemory();
  const mem = memoryTracks.get(id);
  if (mem) {
    if (!isFresh(mem.expiresAt)) {
      memoryTracks.delete(id);
    } else {
      return mem;
    }
  }

  const fromDisk = readTrackFile(id);
  if (!fromDisk) return null;
  memoryTracks.set(id, fromDisk);
  return fromDisk;
}

export function readSubtitleVttBySourceUrl(
  sourceUrl: string,
): (CachedSubtitle & { trackId: string }) | null {
  const trimmed = sourceUrl.trim();
  if (!trimmed) return null;
  const index = loadSourceIndex();
  const trackId = index[hashKey(trimmed)];
  if (!trackId) return null;
  const hit = readSubtitleVtt(trackId);
  if (!hit) return null;
  const refreshed: CachedSubtitle = {
    ...hit,
    expiresAt: Date.now() + SUBTITLE_CACHE_TTL_MS,
  };
  memoryTracks.set(trackId, refreshed);
  writeTrackFile(trackId, refreshed);
  return { ...refreshed, trackId };
}

export function searchCacheKey(query: SubtitleSearchQuery): string {
  const payload = {
    languages: query.languages?.trim().toLowerCase() ?? "",
    imdbId: query.imdbId?.trim().toLowerCase() ?? "",
    tmdbId: query.tmdbId?.trim() ?? "",
    season: query.season ?? null,
    episode: query.episode ?? null,
    type: query.type ?? "",
    releaseFilter: query.releaseFilter?.trim().toLowerCase() ?? "",
  };
  return hashKey(JSON.stringify(payload));
}

export function readCachedSearchResults(
  query: SubtitleSearchQuery,
): SubtitleSearchResult[] | null {
  pruneMemory();
  const key = searchCacheKey(query);
  const mem = memorySearches.get(key);
  if (mem) {
    if (!isFresh(mem.expiresAt)) {
      memorySearches.delete(key);
    } else {
      return mem.results;
    }
  }

  try {
    const raw = fs.readFileSync(searchPath(key), "utf8");
    const parsed = JSON.parse(raw) as CachedSearch;
    if (!Array.isArray(parsed?.results) || typeof parsed.expiresAt !== "number") {
      return null;
    }
    if (!isFresh(parsed.expiresAt)) {
      fs.unlinkSync(searchPath(key));
      return null;
    }
    memorySearches.set(key, parsed);
    return parsed.results;
  } catch {
    return null;
  }
}

export function writeCachedSearchResults(
  query: SubtitleSearchQuery,
  results: SubtitleSearchResult[],
): void {
  pruneMemory();
  ensureDirsSync();
  const key = searchCacheKey(query);
  const entry: CachedSearch = {
    results,
    expiresAt: Date.now() + SUBTITLE_CACHE_TTL_MS,
  };
  memorySearches.set(key, entry);
  fs.writeFileSync(searchPath(key), JSON.stringify(entry), "utf8");
}

/** Best-effort cleanup of expired on-disk entries (safe to call occasionally). */
export async function pruneExpiredSubtitleCache(): Promise<void> {
  ensureDirsSync();
  const now = Date.now();
  try {
    const trackFiles = await fsPromises.readdir(TRACKS_DIR);
    for (const name of trackFiles) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await fsPromises.readFile(path.join(TRACKS_DIR, name), "utf8");
        const parsed = JSON.parse(raw) as { expiresAt?: number };
        if (typeof parsed.expiresAt === "number" && parsed.expiresAt <= now) {
          await fsPromises.unlink(path.join(TRACKS_DIR, name));
        }
      } catch {
        /* ignore bad files */
      }
    }
  } catch {
    /* dir missing */
  }

  try {
    const searchFiles = await fsPromises.readdir(SEARCHES_DIR);
    for (const name of searchFiles) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await fsPromises.readFile(path.join(SEARCHES_DIR, name), "utf8");
        const parsed = JSON.parse(raw) as { expiresAt?: number };
        if (typeof parsed.expiresAt === "number" && parsed.expiresAt <= now) {
          await fsPromises.unlink(path.join(SEARCHES_DIR, name));
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* dir missing */
  }
}
