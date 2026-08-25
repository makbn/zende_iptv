#!/usr/bin/env node

/**
 * Fetch and summarize an Xtream provider without writing credentials or raw
 * credential-bearing playlist URLs to the report.
 *
 * Usage:
 *   XTREAM_SERVER=http://provider.example \
 *   XTREAM_USERNAME=... \
 *   XTREAM_PASSWORD=... \
 *   npm run analyze:xtream
 *
 * Optional:
 *   XTREAM_REPORT_PATH=/tmp/provider-report.json
 */

import { writeFile } from "node:fs/promises";

const serverRaw = process.env.XTREAM_SERVER?.trim() ?? "";
const username = process.env.XTREAM_USERNAME?.trim() ?? "";
const password = process.env.XTREAM_PASSWORD?.trim() ?? "";
const reportPath = process.env.XTREAM_REPORT_PATH?.trim() ?? "";

if (!serverRaw || !username || !password) {
  process.stderr.write(
    "Set XTREAM_SERVER, XTREAM_USERNAME, and XTREAM_PASSWORD. " +
      "Credentials are read only from the environment.\n",
  );
  process.exit(2);
}

let server;
try {
  const withProtocol = /^https?:\/\//i.test(serverRaw)
    ? serverRaw
    : `http://${serverRaw}`;
  const parsed = new URL(withProtocol);
  server = `${parsed.protocol}//${parsed.host}`;
} catch {
  process.stderr.write("XTREAM_SERVER is not a valid HTTP(S) URL.\n");
  process.exit(2);
}

const USER_AGENT = "Zende/0.1 (Xtream catalog analyzer)";
const TIMEOUT_MS = 120_000;

function apiUrl(action) {
  const url = new URL("/player_api.php", server);
  url.searchParams.set("username", username);
  url.searchParams.set("password", password);
  if (action) url.searchParams.set("action", action);
  return url;
}

function playlistUrl() {
  const url = new URL("/get.php", server);
  url.searchParams.set("username", username);
  url.searchParams.set("password", password);
  url.searchParams.set("type", "m3u_plus");
  url.searchParams.set("output", "m3u8");
  return url;
}

async function fetchText(url, label) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${label} returned HTTP ${response.status}`);
    }
    return {
      ok: true,
      text,
      status: response.status,
      bytes: Buffer.byteLength(text),
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      text: "",
      status: null,
      bytes: 0,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchJson(action) {
  const result = await fetchText(apiUrl(action), action || "authentication");
  if (!result.ok) return { ...result, value: null };
  try {
    return { ...result, value: JSON.parse(result.text) };
  } catch {
    return {
      ...result,
      ok: false,
      value: null,
      error: `${action || "authentication"} returned invalid JSON`,
    };
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function topCounts(values, limit = 80) {
  const counts = new Map();
  for (const raw of values) {
    const value = text(raw) || "(empty)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function summarizeCatalog(categoriesValue, streamsValue, idField) {
  const categories = Array.isArray(categoriesValue) ? categoriesValue : [];
  const streams = Array.isArray(streamsValue) ? streamsValue : [];
  const byCategory = new Map();
  for (const category of categories) {
    const id = text(category?.category_id);
    if (!id) continue;
    byCategory.set(id, {
      id,
      name: text(category?.category_name) || "Other",
      count: 0,
      samples: [],
    });
  }
  let uncategorized = 0;
  for (const stream of streams) {
    const categoryId = text(stream?.category_id);
    const entry = byCategory.get(categoryId);
    if (!entry) {
      uncategorized += 1;
      continue;
    }
    entry.count += 1;
    if (entry.samples.length < 4) {
      const name = text(stream?.name);
      if (name) entry.samples.push(name.slice(0, 140));
    }
  }
  const rows = [...byCategory.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  return {
    categoryCount: categories.length,
    itemCount: streams.length,
    uncategorized,
    duplicateCategoryNames: topCounts(categories.map((row) => row?.category_name)).filter(
      (row) => row.count > 1,
    ),
    categories: rows,
    missingIds: streams.filter((row) => !text(row?.[idField])).length,
  };
}

function parseM3u(textValue) {
  const lines = textValue.split(/\r?\n/);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("#EXTINF")) continue;
    const comma = line.lastIndexOf(",");
    const name = comma >= 0 ? line.slice(comma + 1).trim() : "";
    const attributes = {};
    for (const match of line.matchAll(/([\w-]+)="([^"]*)"/g)) {
      attributes[match[1]] = match[2];
    }
    let streamUrl = "";
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next]?.trim() ?? "";
      if (!candidate || candidate.startsWith("#")) continue;
      streamUrl = candidate;
      index = next;
      break;
    }
    let pathKind = "other";
    try {
      const path = new URL(streamUrl).pathname.toLowerCase();
      if (path.includes("/live/")) pathKind = "live";
      else if (path.includes("/movie/") || path.includes("/vod/")) pathKind = "movie";
      else if (path.includes("/series/")) pathKind = "series";
    } catch {
      /* raw URL is deliberately omitted from the report */
    }
    entries.push({
      name,
      groupTitle: text(attributes["group-title"]),
      language: text(attributes["tvg-language"] || attributes.language),
      pathKind,
    });
  }
  return entries;
}

function requestSummary(result) {
  return {
    ok: result.ok,
    status: result.status,
    bytes: result.bytes,
    elapsedMs: result.elapsedMs,
    ...(result.error ? { error: result.error } : {}),
  };
}

const actionNames = {
  liveCategories: "get_live_categories",
  vodCategories: "get_vod_categories",
  seriesCategories: "get_series_categories",
  liveStreams: "get_live_streams",
  vodStreams: "get_vod_streams",
  seriesStreams: "get_series",
};

const results = {};
results.authentication = await fetchJson("");
for (const [key, action] of Object.entries(actionNames)) {
  results[key] = await fetchJson(action);
}
results.playlist = await fetchText(playlistUrl(), "playlist");

const playlistEntries = results.playlist.ok ? parseM3u(results.playlist.text) : [];
const authValue = results.authentication.value;
const report = {
  generatedAt: new Date().toISOString(),
  providerHost: new URL(server).host,
  authentication: {
    ...requestSummary(results.authentication),
    authenticated: authValue?.user_info?.auth === 1 || authValue?.user_info?.auth === "1",
    status: text(authValue?.user_info?.status) || null,
    allowedFormats: Array.isArray(authValue?.user_info?.allowed_output_formats)
      ? authValue.user_info.allowed_output_formats.map(text)
      : [],
  },
  requests: Object.fromEntries(
    Object.entries(results).map(([key, result]) => [key, requestSummary(result)]),
  ),
  api: {
    live: summarizeCatalog(
      results.liveCategories.value,
      results.liveStreams.value,
      "stream_id",
    ),
    movie: summarizeCatalog(
      results.vodCategories.value,
      results.vodStreams.value,
      "stream_id",
    ),
    series: summarizeCatalog(
      results.seriesCategories.value,
      results.seriesStreams.value,
      "series_id",
    ),
  },
  playlist: {
    ...requestSummary(results.playlist),
    entryCount: playlistEntries.length,
    pathKinds: topCounts(playlistEntries.map((entry) => entry.pathKind), 10),
    groups: topCounts(playlistEntries.map((entry) => entry.groupTitle), 120),
    declaredLanguages: topCounts(
      playlistEntries.map((entry) => entry.language).filter(Boolean),
      80,
    ),
    sampleEntries: playlistEntries.slice(0, 20),
  },
};

const safeJson = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) {
  await writeFile(reportPath, safeJson, { mode: 0o600 });
}

const compact = {
  providerHost: report.providerHost,
  authenticated: report.authentication.authenticated,
  live: {
    categories: report.api.live.categoryCount,
    items: report.api.live.itemCount,
  },
  movie: {
    categories: report.api.movie.categoryCount,
    items: report.api.movie.itemCount,
  },
  series: {
    categories: report.api.series.categoryCount,
    items: report.api.series.itemCount,
  },
  playlistEntries: report.playlist.entryCount,
  reportPath: reportPath || null,
  failures: Object.entries(report.requests)
    .filter(([, value]) => !value.ok)
    .map(([key, value]) => ({ key, error: value.error })),
};
process.stdout.write(`${JSON.stringify(compact, null, 2)}\n`);
