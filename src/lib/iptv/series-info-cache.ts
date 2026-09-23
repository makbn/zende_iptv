import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { XtreamSeriesInfo, XtreamVodInfo } from "@/lib/iptv/xtream-types";

/** Episode lists and movie portal payloads stay valid across restarts for one day. */
export const PROVIDER_INFO_TTL_MS = 24 * 60 * 60 * 1000;

type CachedSeriesInfo = {
  cachedAt: string;
  info: XtreamSeriesInfo;
};

type CachedVodInfo = {
  cachedAt: string;
  info: XtreamVodInfo;
};

export function isProviderInfoFresh(
  cachedAt: string,
  now = Date.now(),
  ttlMs = PROVIDER_INFO_TTL_MS,
): boolean {
  const cachedTime = Date.parse(cachedAt);
  return Number.isFinite(cachedTime) && cachedTime <= now && now - cachedTime < ttlMs;
}

function resolveCacheRoot(): string {
  const configured = process.env.ZENDE_SERIES_CACHE_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  if (
    process.env.ZENDE_RECORDINGS_DIR?.trim().startsWith("/data") ||
    process.env.DATABASE_URL?.includes("/data/")
  ) {
    return "/data/series-info-cache";
  }
  return path.join(process.cwd(), "data", "series-info-cache");
}

const CACHE_ROOT = resolveCacheRoot();

function cachePath(namespace: "series" | "vod", providerKey: string, id: string): string {
  if (namespace === "series") {
    const digest = createHash("sha256")
      .update(`${providerKey}\u0000${id}`)
      .digest("hex");
    return path.join(CACHE_ROOT, `${digest}.json`);
  }
  const digest = createHash("sha256")
    .update(`vod\u0000${providerKey}\u0000${id}`)
    .digest("hex");
  return path.join(CACHE_ROOT, "vod", `${digest}.json`);
}

function validSeriesInfo(value: unknown): value is XtreamSeriesInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as XtreamSeriesInfo;
  return candidate.info != null || candidate.seasons != null || candidate.episodes != null;
}

function validVodInfo(value: unknown): value is XtreamVodInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as XtreamVodInfo;
  return candidate.info != null || candidate.movie_data != null;
}

async function readCached<T>(
  filePath: string,
  valid: (value: unknown) => value is T,
): Promise<{ cachedAt: string; info: T } | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const cached = JSON.parse(raw) as { cachedAt?: unknown; info?: unknown };
    if (typeof cached.cachedAt !== "string" || !valid(cached.info)) return null;
    return { cachedAt: cached.cachedAt, info: cached.info };
  } catch {
    return null;
  }
}

async function writeCached(filePath: string, info: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ cachedAt: new Date().toISOString(), info }), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporary, filePath);
}

export async function readCachedSeriesInfo(
  providerKey: string,
  seriesId: string,
): Promise<CachedSeriesInfo | null> {
  return readCached(cachePath("series", providerKey, seriesId), validSeriesInfo);
}

export async function writeCachedSeriesInfo(
  providerKey: string,
  seriesId: string,
  info: XtreamSeriesInfo,
): Promise<void> {
  await writeCached(cachePath("series", providerKey, seriesId), info);
}

export async function readCachedVodInfo(
  providerKey: string,
  vodId: string,
): Promise<CachedVodInfo | null> {
  return readCached(cachePath("vod", providerKey, vodId), validVodInfo);
}

export async function writeCachedVodInfo(
  providerKey: string,
  vodId: string,
  info: XtreamVodInfo,
): Promise<void> {
  await writeCached(cachePath("vod", providerKey, vodId), info);
}
