import "server-only";

import { isBuiltinPresetId } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType, type LibraryContentType } from "@/lib/channels/content-type";
import { yearFromChannelName } from "@/lib/channel/channel-label";
import { loadManualChannelRows } from "@/lib/channels/manual-channels-db";
import { normalizeManualChannel } from "@/lib/channels/manual-channels-policy";
import { mergeBuiltinAndManual } from "@/lib/channels/merge-catalog";
import { prisma } from "@/lib/db/prisma";

export type LibraryCatalogQuery = {
  presetId: string;
  contentType: "all" | LibraryContentType;
  q?: string;
  group?: string | null;
  language?: string | null;
  country?: string | null;
  year?: string | null;
  offset: number;
  limit: number;
};

export type LibraryCatalogFacets = {
  groups: Array<{ name: string; count: number }>;
  languages: Array<{ key: string; label: string; count: number }>;
  countries: Array<{ key: string; label: string; count: number }>;
  years: Array<{ key: string; label: string; count: number }>;
};

export type LibraryCatalogResult = {
  channels: M3uChannel[];
  total: number;
  offset: number;
  limit: number;
  facets: LibraryCatalogFacets;
};

async function loadBuiltinChannels(presetId: string): Promise<M3uChannel[]> {
  if (!isBuiltinPresetId(presetId)) return [];
  const row = await prisma.playlistCatalogCache.findUnique({ where: { presetId } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.channelsJson) as M3uChannel[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadMergedLibraryCatalog(presetId: string): Promise<M3uChannel[]> {
  const [builtin, manualRows] = await Promise.all([
    loadBuiltinChannels(presetId),
    loadManualChannelRows(),
  ]);
  const manual = manualRows.map((row) => normalizeManualChannel(row.channel));
  return mergeBuiltinAndManual(builtin, manual);
}

const MERGED_CACHE_TTL_MS = 45_000;
let mergedCache: { presetId: string; at: number; channels: M3uChannel[] } | null = null;

/** Drop cached rows after catalog import / manual channel edits (server process). */
export function invalidateLibraryCatalogCache(): void {
  mergedCache = null;
}

async function loadMergedLibraryCatalogCached(presetId: string): Promise<M3uChannel[]> {
  const now = Date.now();
  if (
    mergedCache &&
    mergedCache.presetId === presetId &&
    now - mergedCache.at < MERGED_CACHE_TTL_MS
  ) {
    return mergedCache.channels;
  }
  const channels = await loadMergedLibraryCatalog(presetId);
  mergedCache = { presetId, at: now, channels };
  return channels;
}

function matchesQuery(channel: M3uChannel, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (channel.name.toLowerCase().includes(needle)) return true;
  const group = channel.groupTitle ?? "";
  if (group.toLowerCase().includes(needle)) return true;
  const lang = channel.tvgLanguage ?? "";
  if (lang.toLowerCase().includes(needle)) return true;
  const tvgId = channel.tvgId ?? "";
  if (tvgId.toLowerCase().includes(needle)) return true;
  return false;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  fa: "Persian",
  pr: "Persian",
  ir: "Persian",
};

const LANGUAGE_RANK: Record<string, number> = {
  en: 0,
  fa: 2,
  pr: 3,
  ir: 4,
};

const LANGUAGE_ALIASES: Record<string, string> = {
  english: "en",
  arabic: "ar",
  persian: "fa",
  farsi: "fa",
};

const COUNTRY_ALIASES: Record<string, string> = {
  gb: "uk",
  usa: "us",
  "united states": "us",
  "united kingdom": "uk",
  britain: "uk",
  "great britain": "uk",
  canada: "ca",
  australia: "au",
  "new zealand": "nz",
};

const ENGLISH_COUNTRY_KEYS = new Set([
  "us",
  "uk",
  "ca",
  "au",
  "nz",
  "ie",
]);

const COUNTRY_LABELS: Record<string, string> = {
  us: "US",
  uk: "UK",
  ca: "Canada",
  au: "Australia",
  nz: "New Zealand",
  ie: "Ireland",
};

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeFacetKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeLanguageKey(value: string): string {
  const key = normalizeFacetKey(value);
  const countryKey = normalizeCountryKey(key);
  if (countryKey && ENGLISH_COUNTRY_KEYS.has(countryKey)) return "en";
  return LANGUAGE_ALIASES[key] ?? key;
}

function normalizeCountryKey(value: string): string | null {
  const key = normalizeFacetKey(value).replace(/^[([{\s]+|[\])}\s]+$/g, "");
  if (!key) return null;
  return COUNTRY_ALIASES[key] ?? key;
}

function labelCountry(key: string): string {
  return COUNTRY_LABELS[key] ?? titleCase(key);
}

function extractLeadingRegionToken(group: string): string | null {
  const match = group.match(/^\s*[\[(]?\s*([a-z]{2,3}|united states|united kingdom|canada|australia|new zealand|gb|usa)\s*[\])]?(?=\s*(?:[|:\-–—]|\b))/i);
  return match?.[1] ?? null;
}

/** e.g. `EN - FROM (2022) (US)` → `en` */
function languageFromChannelName(name: string): string | null {
  const prefix = name.trim().match(/^[\[(]?([a-z]{2})\s*[\])]?\s*[-–—|:]\s*/i);
  if (!prefix) return null;
  return normalizeLanguageKey(prefix[1]!);
}

function inferLanguageFromGroupText(group: string): string | null {
  const lower = normalizeFacetKey(group);
  if (!lower) return null;

  for (const [alias, key] of Object.entries(LANGUAGE_ALIASES)) {
    if (
      lower === alias ||
      lower.startsWith(`${alias} `) ||
      lower.includes(` ${alias} `) ||
      lower.endsWith(` ${alias}`)
    ) {
      return key;
    }
  }

  const firstWord = lower.split(/\s+/)[0] ?? "";
  return LANGUAGE_ALIASES[firstWord] ?? null;
}

function parseLanguageCountryFromGroup(groupTitle: string | undefined) {
  const group = groupTitle?.trim() ?? "";
  if (!group) {
    return { languageKey: null, countryKey: null };
  }

  const [leftRaw, rightRaw] = group.includes("|")
    ? group.split("|", 2)
    : [extractLeadingRegionToken(group), null];
  const left = leftRaw?.trim();
  const right = rightRaw?.trim();
  const leftCountry = left ? normalizeCountryKey(left) : null;
  let languageKey = left
    ? ENGLISH_COUNTRY_KEYS.has(leftCountry ?? "")
      ? "en"
      : normalizeLanguageKey(left)
    : null;
  const countryKey =
    right
      ? normalizeCountryKey(right)
      : leftCountry && ENGLISH_COUNTRY_KEYS.has(leftCountry)
        ? leftCountry
        : null;

  if (!languageKey) {
    languageKey = inferLanguageFromGroupText(group);
  }

  return {
    languageKey,
    countryKey,
  };
}

function languageFacetFor(channel: M3uChannel) {
  const explicit = channel.tvgLanguage?.trim();
  const fromGroup = parseLanguageCountryFromGroup(channel.groupTitle).languageKey;
  const fromName = languageFromChannelName(channel.name);
  const key = explicit
    ? normalizeLanguageKey(explicit)
    : (fromGroup ?? fromName);
  if (!key) return null;
  const baseLabel = LANGUAGE_LABELS[key] ?? titleCase(key);
  const code = key.toUpperCase();
  return {
    key,
    label: baseLabel.toLowerCase() === code.toLowerCase() ? code : `${baseLabel} (${code})`,
  };
}

function countryFacetFor(channel: M3uChannel) {
  const inferred = parseLanguageCountryFromGroup(channel.groupTitle).countryKey;
  if (!inferred) return null;
  return {
    key: inferred,
    label: labelCountry(inferred),
  };
}

function yearFacetFor(channel: M3uChannel) {
  const year = yearFromChannelName(channel.name);
  if (!year) return null;
  return { key: year, label: year };
}

function languageSortRank(key: string): number {
  if (key in LANGUAGE_RANK) return LANGUAGE_RANK[key]!;
  return 100;
}

function buildFacets(channels: M3uChannel[]): LibraryCatalogFacets {
  const groupCounts = new Map<string, number>();
  const langCounts = new Map<string, { label: string; count: number }>();
  const countryCounts = new Map<string, { label: string; count: number }>();
  const yearCounts = new Map<string, { label: string; count: number }>();

  for (const channel of channels) {
    const group = channel.groupTitle?.trim() || "Other";
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);

    const language = languageFacetFor(channel);
    if (language) {
      const prev = langCounts.get(language.key);
      if (prev) prev.count += 1;
      else langCounts.set(language.key, { label: language.label, count: 1 });
    }

    const country = countryFacetFor(channel);
    if (country) {
      const prev = countryCounts.get(country.key);
      if (prev) prev.count += 1;
      else countryCounts.set(country.key, { label: country.label, count: 1 });
    }

    const year = yearFacetFor(channel);
    if (year) {
      const prev = yearCounts.get(year.key);
      if (prev) prev.count += 1;
      else yearCounts.set(year.key, { label: year.label, count: 1 });
    }
  }

  const groups = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 36)
    .map(([name, count]) => ({ name, count }));

  const languages = [...langCounts.entries()]
    .sort(
      (a, b) =>
        languageSortRank(a[0]) - languageSortRank(b[0]) ||
        b[1].count - a[1].count ||
        a[1].label.localeCompare(b[1].label, undefined, { sensitivity: "base" }),
    )
    .slice(0, 32)
    .map(([key, value]) => ({ key, label: value.label, count: value.count }));

  const countries = [...countryCounts.entries()]
    .sort(
      (a, b) =>
        b[1].count - a[1].count ||
        a[1].label.localeCompare(b[1].label, undefined, { sensitivity: "base" }),
    )
    .slice(0, 48)
    .map(([key, value]) => ({ key, label: value.label, count: value.count }));

  const years = [...yearCounts.entries()]
    .sort(
      (a, b) =>
        Number.parseInt(b[0], 10) - Number.parseInt(a[0], 10) ||
        b[1].count - a[1].count,
    )
    .slice(0, 48)
    .map(([key, value]) => ({ key, label: value.label, count: value.count }));

  return { groups, languages, countries, years };
}

export async function queryLibraryCatalog(
  query: LibraryCatalogQuery,
): Promise<LibraryCatalogResult> {
  const merged = await loadMergedLibraryCatalogCached(query.presetId);

  let scoped = merged.filter((channel) => {
    const type = resolveLibraryContentType(channel);
    if (query.contentType !== "all" && type !== query.contentType) return false;
    return true;
  });

  const facets = buildFacets(scoped);

  if (query.group) {
    scoped = scoped.filter(
      (channel) => (channel.groupTitle?.trim() || "Other") === query.group,
    );
  }
  if (query.language) {
    scoped = scoped.filter(
      (channel) => languageFacetFor(channel)?.key === query.language,
    );
  }
  if (query.country) {
    scoped = scoped.filter(
      (channel) => countryFacetFor(channel)?.key === query.country,
    );
  }
  if (query.year) {
    scoped = scoped.filter(
      (channel) => yearFacetFor(channel)?.key === query.year,
    );
  }
  if (query.q) {
    scoped = scoped.filter((channel) => matchesQuery(channel, query.q!));
  }

  const total = scoped.length;
  const channels = scoped.slice(query.offset, query.offset + query.limit);

  return {
    channels,
    total,
    offset: query.offset,
    limit: query.limit,
    facets,
  };
}

/** Resolve catalog rows for specific URLs (favorites enrich). */
export async function lookupChannelsByUrls(
  presetId: string,
  urls: string[],
): Promise<Map<string, M3uChannel>> {
  const wanted = new Set(urls.filter(Boolean));
  if (wanted.size === 0) return new Map();

  const merged = await loadMergedLibraryCatalogCached(presetId);
  const out = new Map<string, M3uChannel>();
  for (const channel of merged) {
    if (wanted.has(channel.url)) {
      out.set(channel.url, channel);
    }
    if (out.size >= wanted.size) break;
  }
  return out;
}
