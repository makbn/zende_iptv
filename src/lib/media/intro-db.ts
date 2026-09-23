import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type IntroSegment = {
  startMs: number;
  endMs: number;
};

const INTRO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 12 * 60 * 60 * 1000;

type CachedIntro = {
  cachedAt: string;
  ttlMs: number;
  segments: IntroSegment[];
};

function cacheRoot(): string {
  const configured = process.env.ZENDE_INTRO_CACHE_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  if (
    process.env.ZENDE_RECORDINGS_DIR?.trim().startsWith("/data") ||
    process.env.DATABASE_URL?.includes("/data/")
  ) {
    return "/data/intro-cache";
  }
  return path.join(process.cwd(), "data", "intro-cache");
}

function cacheFile(key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return path.join(cacheRoot(), `${digest}.json`);
}

export function normalizeImdbId(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (/^tt\d{5,10}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^\d{5,10}$/.test(trimmed)) return `tt${trimmed.padStart(7, "0")}`;
  return undefined;
}

function cacheKey(input: {
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
}): string {
  return [
    input.imdbId ?? "",
    input.tmdbId ?? "",
    input.season ?? "",
    input.episode ?? "",
  ].join("\u0000");
}

async function readCache(key: string): Promise<IntroSegment[] | null> {
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile(key), "utf8")) as Partial<CachedIntro>;
    if (typeof cached.cachedAt !== "string" || !Array.isArray(cached.segments)) return null;
    const cachedTime = Date.parse(cached.cachedAt);
    const ttlMs = typeof cached.ttlMs === "number" ? cached.ttlMs : INTRO_TTL_MS;
    if (!Number.isFinite(cachedTime) || Date.now() - cachedTime >= ttlMs) return null;
    return cached.segments.filter(
      (segment) =>
        segment &&
        Number.isFinite(segment.startMs) &&
        Number.isFinite(segment.endMs) &&
        segment.endMs > segment.startMs,
    );
  } catch {
    return null;
  }
}

async function writeCache(key: string, segments: IntroSegment[]): Promise<void> {
  const root = cacheRoot();
  await fs.mkdir(root, { recursive: true });
  const target = cacheFile(key);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const entry: CachedIntro = {
    cachedAt: new Date().toISOString(),
    ttlMs: segments.length > 0 ? INTRO_TTL_MS : EMPTY_TTL_MS,
    segments,
  };
  await fs.writeFile(temporary, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, target);
}

function segmentsFromPayload(payload: unknown): IntroSegment[] {
  if (!payload || typeof payload !== "object") return [];
  const intro = (payload as { intro?: unknown }).intro;
  if (!Array.isArray(intro)) return [];
  const segments: IntroSegment[] = [];
  for (const item of intro) {
    if (!item || typeof item !== "object") continue;
    const row = item as { start_ms?: unknown; end_ms?: unknown };
    const startMs = row.start_ms == null ? 0 : Number(row.start_ms);
    const endMs = Number(row.end_ms);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    segments.push({ startMs: Math.max(0, Math.round(startMs)), endMs: Math.round(endMs) });
  }
  return segments;
}

/** Intro windows from The Intro DB, persisted so a restart does not refetch them. */
export async function lookupIntroSegments(input: {
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
}): Promise<IntroSegment[]> {
  const imdbId = normalizeImdbId(input.imdbId);
  const tmdbId = input.tmdbId?.trim().match(/^\d{1,10}$/)?.[0];
  if (!imdbId && !tmdbId) return [];
  const key = cacheKey({ imdbId, tmdbId, season: input.season, episode: input.episode });
  const cached = await readCache(key);
  if (cached) return cached;

  const params = new URLSearchParams();
  if (tmdbId) params.set("tmdb_id", tmdbId);
  if (imdbId) params.set("imdb_id", imdbId);
  if (input.season != null && input.season > 0 && input.episode != null && input.episode > 0) {
    params.set("season", String(input.season));
    params.set("episode", String(input.episode));
  }
  const response = await fetch(`https://api.theintrodb.org/v3/media?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": "Zende/0.1" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) {
    await writeCache(key, []).catch(() => undefined);
    return [];
  }
  if (!response.ok) {
    throw new Error(`Intro lookup failed (${response.status}).`);
  }
  const segments = segmentsFromPayload(await response.json().catch(() => null));
  await writeCache(key, segments).catch(() => undefined);
  return segments;
}
