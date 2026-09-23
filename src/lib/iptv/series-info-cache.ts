import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { XtreamSeriesInfo } from "@/lib/iptv/xtream-types";

type CachedSeriesInfo = {
  cachedAt: string;
  info: XtreamSeriesInfo;
};

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

function cachePath(providerKey: string, seriesId: string): string {
  const digest = createHash("sha256")
    .update(`${providerKey}\u0000${seriesId}`)
    .digest("hex");
  return path.join(CACHE_ROOT, `${digest}.json`);
}

function validSeriesInfo(value: unknown): value is XtreamSeriesInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as XtreamSeriesInfo;
  return candidate.info != null || candidate.seasons != null || candidate.episodes != null;
}

export async function readCachedSeriesInfo(
  providerKey: string,
  seriesId: string,
): Promise<CachedSeriesInfo | null> {
  try {
    const raw = await fs.readFile(cachePath(providerKey, seriesId), "utf8");
    const cached = JSON.parse(raw) as Partial<CachedSeriesInfo>;
    if (typeof cached.cachedAt !== "string" || !validSeriesInfo(cached.info)) return null;
    return { cachedAt: cached.cachedAt, info: cached.info };
  } catch {
    return null;
  }
}

export async function writeCachedSeriesInfo(
  providerKey: string,
  seriesId: string,
  info: XtreamSeriesInfo,
): Promise<void> {
  await fs.mkdir(CACHE_ROOT, { recursive: true });
  const target = cachePath(providerKey, seriesId);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const entry: CachedSeriesInfo = { cachedAt: new Date().toISOString(), info };
  await fs.writeFile(temporary, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, target);
}
