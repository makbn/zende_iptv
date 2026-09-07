import "server-only";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType, type LibraryContentType } from "@/lib/channels/content-type";
import { yearFromChannelName } from "@/lib/channel/channel-label";
import { loadEnabledProviderChannels } from "@/lib/iptv/provider-store";
import {
  countryLabel,
  deriveChannelTaxonomy,
  languageLabel,
  languageSortRank,
} from "@/lib/library/channel-taxonomy";
import {
  buildImdbRatingFacets,
  type ImdbRatingThreshold,
} from "@/lib/library/imdb-rating";
import { isChannelParentalBlocked } from "@/lib/parental/parental-control-store";

export type LibraryCatalogQuery = {
  contentType: "all" | LibraryContentType;
  q?: string;
  group?: string | null;
  category?: string | null;
  language?: string | null;
  country?: string | null;
  year?: string | null;
  minImdbRating?: ImdbRatingThreshold | null;
  /** Empty when this request has a valid session unlock. */
  hiddenPatterns?: string[];
  offset: number;
  limit: number;
};

export type LibraryCatalogFacets = {
  groups: Array<{ name: string; count: number }>;
  categories: Array<{ key: string; label: string; count: number }>;
  languages: Array<{ key: string; label: string; count: number }>;
  countries: Array<{ key: string; label: string; count: number }>;
  years: Array<{ key: string; label: string; count: number }>;
  ratings: Array<{ min: ImdbRatingThreshold; count: number }>;
};

export type LibraryCatalogResult = {
  channels: M3uChannel[];
  total: number;
  offset: number;
  limit: number;
  facets: LibraryCatalogFacets;
};

export async function loadMergedLibraryCatalog(): Promise<M3uChannel[]> {
  return loadEnabledProviderChannels();
}

type IndexedChannel = {
  channel: M3uChannel;
  contentType: LibraryContentType;
  groupName: string;
  categoryKey: string;
  categoryLabel: string;
  languageKey: string | null;
  countryKey: string | null;
  yearKey: string | null;
  imdbRating: number | null;
  searchText: string;
};

type ContentScope = "all" | LibraryContentType;

type CatalogIndex = {
  builtAt: number;
  channelCount: number;
  byUrl: Map<string, M3uChannel>;
  all: IndexedChannel[];
  byContentType: Record<LibraryContentType, IndexedChannel[]>;
  facets: Record<ContentScope, LibraryCatalogFacets>;
};

let catalogIndex: CatalogIndex | null = null;
let indexInflight: Promise<CatalogIndex> | null = null;

/** Drop cached index after catalog import / manual channel edits (server process). */
export function invalidateLibraryCatalogCache(): void {
  catalogIndex = null;
  indexInflight = null;
}

function buildSearchText(channel: M3uChannel): string {
  return [
    channel.name,
    channel.groupTitle ?? "",
    channel.tvgLanguage ?? "",
    channel.tvgId ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function indexChannel(channel: M3uChannel): IndexedChannel {
  const contentType = resolveLibraryContentType(channel);
  const taxonomy = deriveChannelTaxonomy(channel, contentType);
  return {
    channel,
    contentType,
    groupName: channel.groupTitle?.trim() || "Other",
    categoryKey: taxonomy.categoryKey,
    categoryLabel: taxonomy.categoryLabel,
    languageKey: taxonomy.languageKey,
    countryKey: taxonomy.countryKey,
    yearKey: yearFacetFor(channel)?.key ?? null,
    imdbRating: channel.imdbRating ?? null,
    searchText: buildSearchText(channel),
  };
}

function buildFacetsFromIndexed(rows: IndexedChannel[]): LibraryCatalogFacets {
  const groupCounts = new Map<string, number>();
  const categoryCounts = new Map<string, { label: string; count: number }>();
  const langCounts = new Map<string, { label: string; count: number }>();
  const countryCounts = new Map<string, { label: string; count: number }>();
  const yearCounts = new Map<string, { label: string; count: number }>();

  for (const row of rows) {
    groupCounts.set(row.groupName, (groupCounts.get(row.groupName) ?? 0) + 1);

    const previousCategory = categoryCounts.get(row.categoryKey);
    if (previousCategory) previousCategory.count += 1;
    else {
      categoryCounts.set(row.categoryKey, {
        label: row.categoryLabel,
        count: 1,
      });
    }

    if (row.languageKey) {
      const prev = langCounts.get(row.languageKey);
      if (prev) prev.count += 1;
      else {
        langCounts.set(row.languageKey, {
          label: languageLabel(row.languageKey),
          count: 1,
        });
      }
    }

    if (row.countryKey) {
      const prev = countryCounts.get(row.countryKey);
      if (prev) prev.count += 1;
      else {
        countryCounts.set(row.countryKey, {
          label: countryLabel(row.countryKey),
          count: 1,
        });
      }
    }

    if (row.yearKey) {
      const prev = yearCounts.get(row.yearKey);
      if (prev) prev.count += 1;
      else yearCounts.set(row.yearKey, { label: row.yearKey, count: 1 });
    }
  }

  const groups = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 36)
    .map(([name, count]) => ({ name, count }));

  const categories = [...categoryCounts.entries()]
    .sort(
      (a, b) =>
        b[1].count - a[1].count ||
        a[1].label.localeCompare(b[1].label, undefined, { sensitivity: "base" }),
    )
    .map(([key, value]) => ({ key, label: value.label, count: value.count }));

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

  const ratings = buildImdbRatingFacets(
    rows
      .filter((row) => row.contentType === "movie" || row.contentType === "series")
      .map((row) => row.imdbRating),
  );

  return { groups, categories, languages, countries, years, ratings };
}

async function buildCatalogIndex(): Promise<CatalogIndex> {
  const channels = await loadMergedLibraryCatalog();
  const all: IndexedChannel[] = [];
  const byContentType: Record<LibraryContentType, IndexedChannel[]> = {
    live: [],
    movie: [],
    series: [],
  };
  const byUrl = new Map<string, M3uChannel>();

  for (const channel of channels) {
    const indexed = indexChannel(channel);
    all.push(indexed);
    byContentType[indexed.contentType].push(indexed);
    byUrl.set(channel.url, channel);
  }

  return {
    builtAt: Date.now(),
    channelCount: channels.length,
    byUrl,
    all,
    byContentType,
    facets: {
      all: buildFacetsFromIndexed(all),
      live: buildFacetsFromIndexed(byContentType.live),
      movie: buildFacetsFromIndexed(byContentType.movie),
      series: buildFacetsFromIndexed(byContentType.series),
    },
  };
}

/** In-memory catalog index — survives until invalidation (no short TTL). */
export async function getCatalogIndex(): Promise<CatalogIndex> {
  if (catalogIndex) return catalogIndex;

  if (!indexInflight) {
    indexInflight = buildCatalogIndex().then((index) => {
      catalogIndex = index;
      indexInflight = null;
      return index;
    });
  }

  return indexInflight;
}

/** Build catalog index on server start or after playlist changes. */
export async function warmLibraryCatalogIndex(): Promise<{ channelCount: number; elapsedMs: number }> {
  const started = Date.now();
  invalidateLibraryCatalogCache();
  const index = await getCatalogIndex();
  return {
    channelCount: index.channelCount,
    elapsedMs: Date.now() - started,
  };
}

export async function warmLibraryCatalogIndexIfNeeded(): Promise<void> {
  if (catalogIndex) return;
  await getCatalogIndex();
}

function scopeRows(
  index: CatalogIndex,
  contentType: ContentScope,
): IndexedChannel[] {
  return contentType === "all" ? index.all : index.byContentType[contentType];
}

function filterIndexedRows(
  rows: IndexedChannel[],
  filters: {
    group?: string | null;
    category?: string | null;
    language?: string | null;
    country?: string | null;
    year?: string | null;
    minImdbRating?: ImdbRatingThreshold | null;
    q?: string;
  },
): IndexedChannel[] {
  let scoped = rows;
  if (filters.group) {
    scoped = scoped.filter((row) => row.groupName === filters.group);
  }
  if (filters.category) {
    scoped = scoped.filter((row) => row.categoryKey === filters.category);
  } else {
    // Event-only/PPV placeholders are usually offline between events. Keep
    // them out of normal browsing while retaining their dedicated facet.
    scoped = scoped.filter((row) => row.categoryKey !== "ppv-events");
  }
  if (filters.language) {
    scoped = scoped.filter((row) => row.languageKey === filters.language);
  }
  if (filters.country) {
    scoped = scoped.filter((row) => row.countryKey === filters.country);
  }
  if (filters.year) {
    scoped = scoped.filter((row) => row.yearKey === filters.year);
  }
  if (filters.minImdbRating) {
    scoped = scoped.filter(
      (row) => row.imdbRating != null && row.imdbRating >= filters.minImdbRating!,
    );
  }
  if (filters.q) {
    const needle = filters.q.trim().toLowerCase();
    if (needle) {
      scoped = scoped.filter((row) => row.searchText.includes(needle));
    }
  }
  return scoped;
}

function yearFacetFor(channel: M3uChannel) {
  const year = yearFromChannelName(channel.name);
  if (!year) return null;
  return { key: year, label: year };
}

export async function queryLibraryCatalog(
  query: LibraryCatalogQuery,
): Promise<LibraryCatalogResult> {
  const index = await getCatalogIndex();
  const scope: ContentScope =
    query.contentType === "all" ? "all" : query.contentType;
  const hiddenPatterns = query.hiddenPatterns ?? [];
  const parentalScope = hiddenPatterns.length > 0
    ? scopeRows(index, scope).filter(
        (row) => !isChannelParentalBlocked(row.channel, hiddenPatterns),
      )
    : scopeRows(index, scope);
  const facets = hiddenPatterns.length
    ? buildFacetsFromIndexed(parentalScope)
    : index.facets[scope];

  const scoped = filterIndexedRows(parentalScope, {
    group: query.group,
    category: query.category,
    language: query.language,
    country: query.country,
    year: query.year,
    minImdbRating: query.minImdbRating,
    q: query.q,
  });

  const total = scoped.length;
  const channels = scoped
    .slice(query.offset, query.offset + query.limit)
    .map((row) => row.channel);

  return {
    channels,
    total,
    offset: query.offset,
    limit: query.limit,
    facets,
  };
}

export type HomeCatalogShelves = {
  discover: { channels: M3uChannel[]; total: number };
  movies: { channels: M3uChannel[]; total: number };
  series: { channels: M3uChannel[]; total: number };
};

/** Single indexed pass for Home rails (discover + recommended movies/series). */
function pickRandom<T>(array: T[], count: number): T[] {
  const len = array.length;
  const n = Math.min(count, len);
  if (n === 0) return [];

  const copy = array.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (len - i));
    const temp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = temp;
  }
  return copy.slice(0, n);
}

export async function queryHomeCatalogShelves(input: {
  presetId: string;
  language?: string | null;
  hiddenPatterns?: string[];
  discoverLimit?: number;
  movieLimit?: number;
  seriesLimit?: number;
}): Promise<HomeCatalogShelves> {
  const index = await getCatalogIndex();
  const language = input.language?.trim() ? input.language.trim().toLowerCase() : null;
  const discoverLimit = input.discoverLimit ?? 36;
  const movieLimit = input.movieLimit ?? 18;
  const seriesLimit = input.seriesLimit ?? 18;
  const hiddenPatterns = input.hiddenPatterns ?? [];

  const allowed = (rows: IndexedChannel[]) =>
    hiddenPatterns.length
      ? rows.filter(
          (row) => !isChannelParentalBlocked(row.channel, hiddenPatterns),
        )
      : rows;
  const discoverScoped = filterIndexedRows(allowed(index.byContentType.live), { language });
  const movieScoped = filterIndexedRows(allowed(index.byContentType.movie), { language });
  const seriesScoped = filterIndexedRows(allowed(index.byContentType.series), { language });

  return {
    discover: {
      channels: pickRandom(discoverScoped, discoverLimit).map((row) => row.channel),
      total: discoverScoped.length,
    },
    movies: {
      channels: pickRandom(movieScoped, movieLimit).map((row) => row.channel),
      total: movieScoped.length,
    },
    series: {
      channels: pickRandom(seriesScoped, seriesLimit).map((row) => row.channel),
      total: seriesScoped.length,
    },
  };
}

/** Resolve catalog rows for specific URLs (favorites enrich). */
export async function lookupChannelsByUrls(
  presetId: string,
  urls: string[],
): Promise<Map<string, M3uChannel>> {
  const wanted = urls.filter(Boolean);
  if (wanted.length === 0) return new Map();

  const index = await getCatalogIndex();
  const out = new Map<string, M3uChannel>();
  for (const url of wanted) {
    const hit = index.byUrl.get(url);
    if (hit) out.set(url, hit);
  }
  return out;
}
