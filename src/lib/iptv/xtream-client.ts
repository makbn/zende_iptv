import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { redactStreamUrlForLog } from "@/lib/stream/redact-stream-url";
import type {
  XtreamCategory,
  XtreamCategoryType,
  XtreamCredentials,
  XtreamLiveStream,
  XtreamSeriesInfo,
  XtreamSeriesItem,
  XtreamStreamType,
  XtreamVodInfo,
  XtreamVodStream,
} from "@/lib/iptv/xtream-types";

const log = createServerLogger("lib.xtream.client");

const ACTION_BY_CATEGORY: Record<XtreamCategoryType, string> = {
  live: "get_live_categories",
  vod: "get_vod_categories",
  series: "get_series_categories",
};

const ACTION_BY_STREAM: Record<XtreamStreamType, string> = {
  live: "get_live_streams",
  movie: "get_vod_streams",
  series: "get_series",
};

function playerApiBase(creds: XtreamCredentials): string {
  const raw = creds.serverUrl.trim();
  const withProto =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `http://${raw}`;
  const u = new URL(withProto);
  const params = new URLSearchParams({
    username: creds.username.trim(),
    password: creds.password.trim(),
  });
  return `${u.protocol}//${u.host}/player_api.php?${params.toString()}`;
}

function redactXtreamUrl(url: string): string {
  return redactStreamUrlForLog(url);
}

async function xtreamRequest<T>(
  creds: XtreamCredentials,
  action: string,
  extra?: Record<string, string | number>,
): Promise<T | null> {
  const base = playerApiBase(creds);
  const params = new URLSearchParams({ action });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params.set(key, String(value));
    }
  }
  const url = `${base}&${params.toString()}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Zende/0.1 (xtream client)" },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      log.warn("xtream upstream non-OK", {
        action,
        status: res.status,
        elapsedMs: Date.now() - started,
        url: redactXtreamUrl(url),
        bodyPreview: text.slice(0, 200),
      });
      return null;
    }
    if (!text.trim()) {
      log.warn("xtream upstream empty body", {
        action,
        elapsedMs: Date.now() - started,
        url: redactXtreamUrl(url),
      });
      return null;
    }
    const parsed = JSON.parse(text) as T;
    log.debug("xtream upstream ok", {
      action,
      elapsedMs: Date.now() - started,
      bytes: text.length,
    });
    return parsed;
  } catch (err) {
    log.error("xtream upstream failed", {
      action,
      elapsedMs: Date.now() - started,
      url: redactXtreamUrl(url),
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** IPTVnator: XtreamApiService.getCategories */
export async function fetchXtreamCategories(
  creds: XtreamCredentials,
  type: XtreamCategoryType,
): Promise<XtreamCategory[]> {
  const rows = await xtreamRequest<Array<Record<string, unknown>>>(
    creds,
    ACTION_BY_CATEGORY[type],
  );
  if (!Array.isArray(rows)) {
    log.warn("xtream categories not array", { type });
    return [];
  }
  return rows.map((row) => ({
    category_id: String(row.category_id ?? ""),
    category_name: String(row.category_name ?? "Other"),
    ...(row.parent_id != null ? { parent_id: String(row.parent_id) } : {}),
  }));
}

/** IPTVnator: XtreamApiService.getStreams */
export async function fetchXtreamStreams(
  creds: XtreamCredentials,
  type: XtreamStreamType,
): Promise<XtreamLiveStream[] | XtreamVodStream[] | XtreamSeriesItem[]> {
  const rows = await xtreamRequest<unknown[]>(creds, ACTION_BY_STREAM[type]);
  if (!Array.isArray(rows)) {
    log.warn("xtream streams not array", { type });
    return [];
  }
  log.info("xtream streams fetched", { type, count: rows.length });
  return rows as XtreamLiveStream[] & XtreamVodStream[] & XtreamSeriesItem[];
}

export async function fetchXtreamVodInfo(
  creds: XtreamCredentials,
  vodId: string | number,
): Promise<XtreamVodInfo | null> {
  return xtreamRequest<XtreamVodInfo>(creds, "get_vod_info", { vod_id: vodId });
}

/** IPTVnator: XtreamApiService.getSeriesInfo — required before episode playback. */
export async function fetchXtreamSeriesInfo(
  creds: XtreamCredentials,
  seriesId: string | number,
): Promise<XtreamSeriesInfo | null> {
  return xtreamRequest<XtreamSeriesInfo>(creds, "get_series_info", { series_id: seriesId });
}

export function xtreamCredentialsFromHostFields(input: {
  host: string;
  username: string;
  password: string;
}): XtreamCredentials | null {
  const hostRaw = input.host.trim();
  const username = input.username.trim();
  const password = input.password.trim();
  if (!hostRaw || !username || !password) return null;
  try {
    const withProto =
      hostRaw.startsWith("http://") || hostRaw.startsWith("https://")
        ? hostRaw
        : `http://${hostRaw}`;
    const u = new URL(withProto);
    if (!u.hostname) return null;
    return {
      serverUrl: `${u.protocol}//${u.host}`,
      username,
      password,
    };
  } catch {
    return null;
  }
}
