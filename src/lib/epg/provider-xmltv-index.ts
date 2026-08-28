import "server-only";

import { deserialize, serialize } from "node:v8";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { createServerLogger } from "@/core/logging/server";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { prisma } from "@/lib/db/prisma";
import {
  parseProviderXmltvChannelBlock,
  parseProviderXmltvProgrammeBlock,
  type ProviderXmltvProgramme,
} from "@/lib/epg/provider-xmltv-parse";
import { expandChannelIdVariants } from "@/lib/epg/xmltv-parse";
import { loadEnabledProviderChannels } from "@/lib/iptv/provider-store";
import { fetchXtreamXmltv } from "@/lib/iptv/xtream-client";
import {
  loadEnabledXtreamProviderCredentials,
  type ScopedXtreamCredentials,
} from "@/lib/iptv/xtream-portal-store";

const log = createServerLogger("lib.epg.providerXmltvIndex");
const REFRESH_MS = 60 * 60 * 1000;
const PAST_WINDOW_MS = 6 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const GUIDE_KEY_SEPARATOR = "\u0000";
const SNAPSHOT_FORMAT_VERSION = 1;

export type ProviderGuideChannel = {
  channel: M3uChannel;
  guideKey: string;
  epgId: string;
  searchText: string;
};

export type ProviderGuideSearchDocument = {
  guideKey: string;
  /** Null identifies the channel metadata document; otherwise indexes its programme array. */
  programmeIndex: number | null;
};

export type ProviderGuideSearchMatches = {
  guideKeys: Set<string>;
  channelKeys: Set<string>;
  programmeIndexesByGuideKey: Map<string, Set<number>>;
};

export type ProviderXmltvIndex = {
  /** Compatibility maps used by Threadfin when provider ownership is unavailable. */
  channelNames: Map<string, string>;
  programmesByChannel: Map<string, ProviderXmltvProgramme[]>;
  /** Provider-scoped maps used by Guide so duplicate EPG ids never collide. */
  channelNamesByGuideKey: Map<string, string>;
  programmesByGuideKey: Map<string, ProviderXmltvProgramme[]>;
  guideChannels: Map<string, ProviderGuideChannel>;
  searchDocuments: ProviderGuideSearchDocument[];
  searchPostings: Map<string, number[]>;
  searchTokens: string[];
  fetchedAt: number;
  version: string;
  providerCount: number;
  programmeCount: number;
};

type ParsedProviderGuide = {
  providerId: string;
  channelNames: Map<string, string>;
  programmesByChannel: Map<string, ProviderXmltvProgramme[]>;
  bytes: number;
  fetchedAt: number;
};

let activeIndex: ProviderXmltvIndex | null = null;
let refreshInflight: Promise<ProviderXmltvIndex> | null = null;
let hydrationInflight: Promise<ProviderXmltvIndex | null> | null = null;
let generation = 0;
let refreshTimer: NodeJS.Timeout | null = null;

type PersistedProviderXmltvSnapshot = {
  formatVersion: number;
  index: ProviderXmltvIndex;
};

function isProviderXmltvIndex(value: unknown): value is ProviderXmltvIndex {
  if (!value || typeof value !== "object") return false;
  const index = value as Partial<ProviderXmltvIndex>;
  return (
    index.channelNames instanceof Map &&
    index.programmesByChannel instanceof Map &&
    index.channelNamesByGuideKey instanceof Map &&
    index.programmesByGuideKey instanceof Map &&
    index.guideChannels instanceof Map &&
    Array.isArray(index.searchDocuments) &&
    index.searchPostings instanceof Map &&
    Array.isArray(index.searchTokens) &&
    typeof index.fetchedAt === "number" &&
    typeof index.version === "string" &&
    typeof index.providerCount === "number" &&
    typeof index.programmeCount === "number"
  );
}

/** Node's structured serializer preserves Maps and arrays without a JSON reconstruction pass. */
export function encodeProviderXmltvSnapshot(index: ProviderXmltvIndex): Uint8Array<ArrayBuffer> {
  const encoded = serialize({ formatVersion: SNAPSHOT_FORMAT_VERSION, index });
  const data = new Uint8Array(encoded.byteLength);
  data.set(encoded);
  return data;
}

export function decodeProviderXmltvSnapshot(data: Uint8Array): ProviderXmltvIndex | null {
  let snapshot: Partial<PersistedProviderXmltvSnapshot> | null;
  try {
    snapshot = deserialize(data) as Partial<PersistedProviderXmltvSnapshot> | null;
  } catch {
    return null;
  }
  if (!snapshot || snapshot.formatVersion !== SNAPSHOT_FORMAT_VERSION) return null;
  if (!isProviderXmltvIndex(snapshot.index)) return null;
  return snapshot.index;
}

async function persistProviderXmltvIndex(index: ProviderXmltvIndex): Promise<void> {
  const data = encodeProviderXmltvSnapshot(index);
  const values = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    version: index.version,
    fetchedAt: new Date(index.fetchedAt),
    providerCount: index.providerCount,
    channelCount: index.guideChannels.size,
    programmeCount: index.programmeCount,
    data,
  };
  await prisma.epgGuideSnapshot.upsert({
    where: { id: 1 },
    create: { id: 1, ...values },
    update: values,
  });
  log.info("provider EPG index persisted", {
    version: index.version,
    bytes: data.byteLength,
    channels: index.guideChannels.size,
    programmes: index.programmeCount,
  });
}

function loadPersistedProviderXmltvIndex(): Promise<ProviderXmltvIndex | null> {
  if (hydrationInflight) return hydrationInflight;
  hydrationInflight = prisma.epgGuideSnapshot
    .findUnique({ where: { id: 1 }, select: { formatVersion: true, data: true } })
    .then((row) => {
      if (!row || row.formatVersion !== SNAPSHOT_FORMAT_VERSION) return null;
      const index = decodeProviderXmltvSnapshot(row.data);
      if (!index) {
        log.warn("persisted provider EPG index has an unsupported or invalid format");
        return null;
      }
      log.info("provider EPG index hydrated", {
        version: index.version,
        channels: index.guideChannels.size,
        programmes: index.programmeCount,
      });
      return index;
    })
    .catch((error) => {
      log.warn("persisted provider EPG index could not be loaded", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    })
    .finally(() => {
      hydrationInflight = null;
    });
  return hydrationInflight;
}

export function canonicalEpgId(value: string): string {
  const trimmed = value.trim();
  const suffix = trimmed.lastIndexOf("@");
  return (suffix > 0 ? trimmed.slice(0, suffix) : trimmed).toLowerCase();
}

export function providerGuideKey(providerId: string, epgId: string): string {
  return `${providerId}${GUIDE_KEY_SEPARATOR}${canonicalEpgId(epgId)}`;
}

/** Resolve the provider's catalog tvg-id to the exact EPG variant stored in the index. */
export function resolveProviderGuideKey(
  index: ProviderXmltvIndex,
  providerId: string,
  tvgId: string,
): string | null {
  const scopedProvider = providerId.trim();
  if (!scopedProvider) return null;
  for (const variant of expandChannelIdVariants(tvgId)) {
    const key = providerGuideKey(scopedProvider, variant);
    if (index.guideChannels.has(key)) return key;
  }
  return null;
}

export function tokenizeGuideSearch(value: string): string[] {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function matchesGuideSearch(value: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const words = tokenizeGuideSearch(value);
  return terms.every((term) =>
    words.some((word) => (term.length <= 2 ? word === term : word.startsWith(term))),
  );
}

function lowerBound(values: string[], needle: string): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]!.localeCompare(needle) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

function postingsForTerm(index: ProviderXmltvIndex, term: string): Set<number> {
  if (term.length <= 2) return new Set(index.searchPostings.get(term) ?? []);
  const matches = new Set<number>();
  for (let i = lowerBound(index.searchTokens, term); i < index.searchTokens.length; i += 1) {
    const token = index.searchTokens[i]!;
    if (!token.startsWith(term)) break;
    for (const documentId of index.searchPostings.get(token) ?? []) matches.add(documentId);
  }
  return matches;
}

/** Lucene-style document postings lookup with AND semantics and prefix matching. */
export function searchProviderGuideDocuments(
  index: ProviderXmltvIndex,
  query: string,
): ProviderGuideSearchMatches {
  const terms = [...new Set(tokenizeGuideSearch(query))];
  if (terms.length === 0) {
    return {
      guideKeys: new Set(index.guideChannels.keys()),
      channelKeys: new Set(),
      programmeIndexesByGuideKey: new Map(),
    };
  }
  const ordered = terms
    .map((term) => postingsForTerm(index, term))
    .sort((a, b) => a.size - b.size);
  if (ordered[0]?.size === 0) {
    return { guideKeys: new Set(), channelKeys: new Set(), programmeIndexesByGuideKey: new Map() };
  }
  const result = new Set(ordered[0]);
  for (const postings of ordered.slice(1)) {
    for (const documentId of result) {
      if (!postings.has(documentId)) result.delete(documentId);
    }
    if (result.size === 0) break;
  }

  const guideKeys = new Set<string>();
  const channelKeys = new Set<string>();
  const programmeIndexesByGuideKey = new Map<string, Set<number>>();
  for (const documentId of result) {
    const document = index.searchDocuments[documentId];
    if (!document) continue;
    guideKeys.add(document.guideKey);
    if (document.programmeIndex == null) {
      channelKeys.add(document.guideKey);
      continue;
    }
    const indexes = programmeIndexesByGuideKey.get(document.guideKey) ?? new Set<number>();
    indexes.add(document.programmeIndex);
    programmeIndexesByGuideKey.set(document.guideKey, indexes);
  }
  return { guideKeys, channelKeys, programmeIndexesByGuideKey };
}

export function searchProviderGuideKeys(index: ProviderXmltvIndex, query: string): Set<string> {
  return searchProviderGuideDocuments(index, query).guideKeys;
}

function nextBlock(buffer: string):
  | { start: number; end: number; kind: "channel" | "programme" }
  | null {
  const channelStart = buffer.search(/<channel\b/i);
  const programmeStart = buffer.search(/<programme\b/i);
  if (channelStart < 0 && programmeStart < 0) return null;
  const kind =
    programmeStart >= 0 && (channelStart < 0 || programmeStart < channelStart)
      ? "programme"
      : "channel";
  const start = kind === "programme" ? programmeStart : channelStart;
  const endTag = kind === "programme" ? "</programme>" : "</channel>";
  const endAt = buffer.toLowerCase().indexOf(endTag, start);
  if (endAt < 0) return null;
  return { start, end: endAt + endTag.length, kind };
}

async function parseProviderGuide(provider: ScopedXtreamCredentials): Promise<ParsedProviderGuide> {
  const response = await fetchXtreamXmltv(provider.credentials);
  if (!response?.body) throw new Error(`XMLTV is unavailable for ${provider.providerName}.`);

  const started = Date.now();
  const minTime = started - PAST_WINDOW_MS;
  const maxTime = started + FUTURE_WINDOW_MS;
  const channelNames = new Map<string, string>();
  const programmesByChannel = new Map<string, ProviderXmltvProgramme[]>();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;

  const consume = (flush = false) => {
    while (true) {
      const block = nextBlock(buffer);
      if (!block) break;
      const raw = buffer.slice(block.start, block.end);
      buffer = buffer.slice(block.end);
      if (block.kind === "channel") {
        const channel = parseProviderXmltvChannelBlock(raw);
        if (channel) channelNames.set(canonicalEpgId(channel.id), channel.name);
        continue;
      }
      const programme = parseProviderXmltvProgrammeBlock(raw);
      if (!programme || programme.stopMs < minTime || programme.startMs > maxTime) continue;
      const key = canonicalEpgId(programme.channelId);
      const rows = programmesByChannel.get(key) ?? [];
      rows.push(programme);
      programmesByChannel.set(key, rows);
    }
    if (buffer.length > 2_000_000 || flush) {
      const lower = buffer.toLowerCase();
      const lastStart = Math.max(lower.lastIndexOf("<channel"), lower.lastIndexOf("<programme"));
      buffer = lastStart >= 0 ? buffer.slice(lastStart) : buffer.slice(-1024);
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    buffer += decoder.decode(chunk.value, { stream: true });
    consume();
  }
  buffer += decoder.decode();
  consume(true);
  for (const rows of programmesByChannel.values()) {
    rows.sort((a, b) => a.startMs - b.startMs || a.stopMs - b.stopMs);
  }

  log.info("provider XMLTV snapshot parsed", {
    providerId: provider.providerId,
    providerName: provider.providerName,
    bytes,
    channels: channelNames.size,
    programmeChannels: programmesByChannel.size,
    programmes: [...programmesByChannel.values()].reduce((sum, rows) => sum + rows.length, 0),
    elapsedMs: Date.now() - started,
  });
  return {
    providerId: provider.providerId,
    channelNames,
    programmesByChannel,
    bytes,
    fetchedAt: Date.now(),
  };
}

function addSearchDocument(
  documents: ProviderGuideSearchDocument[],
  postings: Map<string, number[]>,
  document: ProviderGuideSearchDocument,
  text: string,
): void {
  const documentId = documents.length;
  documents.push(document);
  for (const token of new Set(tokenizeGuideSearch(text))) {
    const documentIds = postings.get(token) ?? [];
    documentIds.push(documentId);
    postings.set(token, documentIds);
  }
}

function copyPreviousProvider(previous: ProviderXmltvIndex, providerId: string): ParsedProviderGuide | null {
  const prefix = `${providerId}${GUIDE_KEY_SEPARATOR}`;
  const channelNames = new Map<string, string>();
  const programmesByChannel = new Map<string, ProviderXmltvProgramme[]>();
  for (const [key, name] of previous.channelNamesByGuideKey) {
    if (key.startsWith(prefix)) channelNames.set(key.slice(prefix.length), name);
  }
  for (const [key, rows] of previous.programmesByGuideKey) {
    if (key.startsWith(prefix)) programmesByChannel.set(key.slice(prefix.length), rows);
  }
  if (channelNames.size === 0 && programmesByChannel.size === 0) return null;
  return { providerId, channelNames, programmesByChannel, bytes: 0, fetchedAt: previous.fetchedAt };
}

async function buildProviderXmltvIndex(previous: ProviderXmltvIndex | null): Promise<ProviderXmltvIndex> {
  const started = Date.now();
  const [providers, channels] = await Promise.all([
    loadEnabledXtreamProviderCredentials(),
    loadEnabledProviderChannels(),
  ]);
  const settled = await Promise.allSettled(providers.map(parseProviderGuide));
  const parsed: ParsedProviderGuide[] = [];
  let freshProviders = 0;

  settled.forEach((result, index) => {
    const provider = providers[index]!;
    if (result.status === "fulfilled") {
      parsed.push(result.value);
      freshProviders += 1;
      return;
    }
    const fallback = previous ? copyPreviousProvider(previous, provider.providerId) : null;
    if (fallback) parsed.push(fallback);
    log.warn("provider XMLTV refresh failed", {
      providerId: provider.providerId,
      providerName: provider.providerName,
      servingPreviousSnapshot: Boolean(fallback),
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });

  if (providers.length > 0 && freshProviders === 0 && parsed.length === 0) {
    throw new Error("No provider XMLTV source could be indexed.");
  }

  const channelNames = new Map<string, string>();
  const programmesByChannel = new Map<string, ProviderXmltvProgramme[]>();
  const channelNamesByGuideKey = new Map<string, string>();
  const programmesByGuideKey = new Map<string, ProviderXmltvProgramme[]>();

  for (const provider of parsed) {
    for (const [epgId, name] of provider.channelNames) {
      const key = providerGuideKey(provider.providerId, epgId);
      channelNamesByGuideKey.set(key, name);
      if (!channelNames.has(epgId)) channelNames.set(epgId, name);
    }
    for (const [epgId, rows] of provider.programmesByChannel) {
      const key = providerGuideKey(provider.providerId, epgId);
      programmesByGuideKey.set(key, rows);
      if (!programmesByChannel.has(epgId)) programmesByChannel.set(epgId, rows);
    }
  }

  const guideChannels = new Map<string, ProviderGuideChannel>();
  const searchDocuments: ProviderGuideSearchDocument[] = [];
  const searchPostings = new Map<string, number[]>();
  for (const channel of channels) {
    if (resolveLibraryContentType(channel) !== "live") continue;
    const providerId = channel.providerId?.trim();
    const tvgId = channel.tvgId?.trim();
    if (!providerId || !tvgId) continue;

    const variants = expandChannelIdVariants(tvgId).map(canonicalEpgId);
    const matchedEpgId = variants.find((variant) =>
      programmesByGuideKey.has(providerGuideKey(providerId, variant)),
    );
    if (!matchedEpgId) continue;
    const guideKey = providerGuideKey(providerId, matchedEpgId);
    const searchText = [
      channel.name,
      channel.groupTitle ?? "",
      channel.tvgId ?? "",
      channel.providerName ?? "",
    ].join(" ");
    guideChannels.set(guideKey, { channel, guideKey, epgId: matchedEpgId, searchText });
    addSearchDocument(searchDocuments, searchPostings, { guideKey, programmeIndex: null }, searchText);
  }

  for (const [guideKey, programmes] of programmesByGuideKey) {
    if (!guideChannels.has(guideKey)) continue;
    for (let programmeIndex = 0; programmeIndex < programmes.length; programmeIndex += 1) {
      const programme = programmes[programmeIndex]!;
      addSearchDocument(
        searchDocuments,
        searchPostings,
        { guideKey, programmeIndex },
        `${programme.title} ${programme.description}`,
      );
    }
  }

  const fetchedAt = Date.now();
  const index: ProviderXmltvIndex = {
    channelNames,
    programmesByChannel,
    channelNamesByGuideKey,
    programmesByGuideKey,
    guideChannels,
    searchDocuments,
    searchPostings,
    searchTokens: [...searchPostings.keys()].sort((a, b) => a.localeCompare(b)),
    fetchedAt,
    version: `epg-${fetchedAt.toString(36)}`,
    providerCount: parsed.length,
    programmeCount: [...programmesByGuideKey.values()].reduce((sum, rows) => sum + rows.length, 0),
  };
  log.info("blue-green provider EPG index ready", {
    version: index.version,
    providers: index.providerCount,
    freshProviders,
    channels: index.guideChannels.size,
    programmes: index.programmeCount,
    searchDocuments: index.searchDocuments.length,
    searchTerms: index.searchTokens.length,
    elapsedMs: Date.now() - started,
  });
  return index;
}

function beginRefresh(): Promise<ProviderXmltvIndex> {
  if (refreshInflight) return refreshInflight;
  const refreshGeneration = generation;
  const previous = activeIndex;
  refreshInflight = buildProviderXmltvIndex(previous)
    .then(async (next) => {
      if (refreshGeneration === generation) {
        try {
          await persistProviderXmltvIndex(next);
        } catch (error) {
          log.warn("provider EPG index persistence failed; activating in memory", {
            version: next.version,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (refreshGeneration === generation) {
        activeIndex = next;
        log.info("provider EPG index activated", {
          previousVersion: previous?.version ?? null,
          version: next.version,
        });
      }
      return refreshGeneration === generation ? next : activeIndex ?? next;
    })
    .finally(() => {
      refreshInflight = null;
    });
  return refreshInflight;
}

function ensureRefreshTimer(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    void beginRefresh().catch((error) => {
      log.warn("scheduled provider EPG refresh failed; active index retained", {
        activeVersion: activeIndex?.version ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, REFRESH_MS);
  if (typeof refreshTimer.unref === "function") refreshTimer.unref();
}

/**
 * Serve the active index immediately. Once it is one hour old, build a green
 * replacement in the background and atomically promote it when complete.
 */
export async function getProviderXmltvIndex(): Promise<ProviderXmltvIndex> {
  ensureRefreshTimer();
  if (activeIndex) {
    if (Date.now() - activeIndex.fetchedAt >= REFRESH_MS) {
      void beginRefresh().catch((error) => {
        log.warn("background provider EPG refresh failed; active index retained", {
          activeVersion: activeIndex?.version ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return activeIndex;
  }

  const hydrationGeneration = generation;
  const persisted = await loadPersistedProviderXmltvIndex();
  if (activeIndex) return activeIndex;
  if (persisted && hydrationGeneration === generation) {
    activeIndex = persisted;
    if (Date.now() - persisted.fetchedAt >= REFRESH_MS) {
      void beginRefresh().catch((error) => {
        log.warn("background provider EPG refresh failed; hydrated index retained", {
          activeVersion: activeIndex?.version ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return persisted;
  }
  return beginRefresh();
}

/** Blocking refresh for the hourly cron endpoint; readers keep the active version while this runs. */
export async function refreshProviderXmltvIndex(): Promise<ProviderXmltvIndex> {
  ensureRefreshTimer();
  return beginRefresh();
}

export function getProviderXmltvCacheStats() {
  return {
    entries: activeIndex ? 1 : 0,
    channels: activeIndex?.guideChannels.size ?? 0,
    programmes: activeIndex?.programmeCount ?? 0,
    inFlight: refreshInflight ? 1 : 0,
    ttlMs: REFRESH_MS,
    version: activeIndex?.version ?? null,
    stale: activeIndex ? Date.now() - activeIndex.fetchedAt >= REFRESH_MS : false,
  };
}

export async function clearProviderXmltvCache(): Promise<void> {
  generation += 1;
  activeIndex = null;
  refreshInflight = null;
  hydrationInflight = null;
  await prisma.epgGuideSnapshot.deleteMany({ where: { id: 1 } });
}
