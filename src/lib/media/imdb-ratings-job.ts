import "server-only";

import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import { createServerLogger } from "@/core/logging/server";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { prisma } from "@/lib/db/prisma";
import { fetchXtreamStreams } from "@/lib/iptv/xtream-client";
import {
  parseXtreamSeriesIdFromContainerUrl,
  parseXtreamVodIdFromStreamUrl,
} from "@/lib/iptv/xtream-url";
import { invalidateLibraryCatalogCache } from "@/lib/library/catalog";
import {
  imdbTitleTypeMatchesMedia,
  normalizeImdbLookupTitle,
  parseImdbRatingRow,
  parseImdbTitleBasicsRow,
  withImdbRating,
  type ImdbRatingRow,
  type ImdbTitleBasicsRow,
} from "@/lib/media/imdb-rating";
import { parseMediaMetadataPayload, type MediaMetadata } from "@/lib/media/media-metadata";
import { isAdultContentChannel } from "@/lib/parental/parental-control-store";

const log = createServerLogger("lib.media.imdbRatingsJob");
const DEFAULT_BASICS_DATASET_URL = "https://datasets.imdbws.com/title.basics.tsv.gz";
const DEFAULT_RATINGS_DATASET_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const DATASET_TIMEOUT_MS = 90 * 60 * 1_000;
const MATCH_RETRY_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_MATCHES_PER_CANDIDATE = 16;

export type ImdbRatingsJobResult = {
  candidates: number;
  adultSkipped: number;
  existingIds: number;
  directIds: number;
  basicsAttempted: number;
  basicsMatched: number;
  unmatched: number;
  imdbIds: number;
  datasetMatched: number;
  updated: number;
  elapsedMs: number;
};

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

async function mapConcurrent<T>(values: T[], limit: number, task: (value: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) await task(values[cursor++]!);
  });
  await Promise.all(workers);
}

type Candidate = {
  id: string;
  name: string;
  url: string;
  duration: number;
  groupTitle: string | null;
  contentType: "movie" | "series";
  mediaMetadata: {
    imdbId: string | null;
    imdbMatchAttemptedAt: Date | null;
    payloadJson: string;
    fetchedAt: Date;
  } | null;
  provider: {
    id: string;
    kind: string;
    serverUrl: string | null;
    username: string | null;
    password: string | null;
  };
};

type PreparedCandidate = Candidate & {
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  directImdbId: string | null;
  shouldAttemptMatch: boolean;
};

function hintKey(providerId: string, contentType: "movie" | "series", externalId: string) {
  return `${providerId}:${contentType}:${externalId}`;
}

function externalIdForCandidate(row: Candidate): string | null {
  return row.contentType === "movie"
    ? parseXtreamVodIdFromStreamUrl(row.url)
    : parseXtreamSeriesIdFromContainerUrl(row.url);
}

function firstText(source: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value !== "string" && typeof value !== "number") continue;
    const clean = String(value).trim();
    if (clean) return clean;
  }
  return null;
}

function imdbIdFromHint(info: Record<string, unknown> | undefined): string | null {
  return firstText(info, ["imdb_id", "imdb", "imdbId"])?.match(/tt\d+/i)?.[0]?.toLowerCase() ?? null;
}

function yearFromHint(info: Record<string, unknown> | undefined, fallback?: string): string | null {
  const value = firstText(info, ["year", "release_date", "releasedate", "first_air_date"]);
  return value?.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? fallback ?? null;
}

function cleanProviderTitle(value: string): string {
  return parseChannelLabel(value).displayName
    .replace(/^\s*(?:[a-z]{2,3}|multi(?:-lang)?)\s*[|:]\s*/i, "")
    .trim();
}

async function loadXtreamMetadataHints(candidates: Candidate[]) {
  const providers = [...new Map(candidates.map((item) => item.provider).filter((provider) =>
    provider.kind === "xtream" && provider.serverUrl && provider.username && provider.password,
  ).map((provider) => [provider.id, provider])).values()];
  const hints = new Map<string, Record<string, unknown>>();
  await mapConcurrent(providers, 2, async (provider) => {
    const credentials = {
      serverUrl: provider.serverUrl!, username: provider.username!, password: provider.password!,
    };
    const [movies, series] = await Promise.all([
      fetchXtreamStreams(credentials, "movie"), fetchXtreamStreams(credentials, "series"),
    ]);
    for (const raw of movies as Array<Record<string, unknown>>) {
      const id = String(raw.stream_id ?? "").trim();
      if (id) hints.set(hintKey(provider.id, "movie", id), raw);
    }
    for (const raw of series as Array<Record<string, unknown>>) {
      const id = String(raw.series_id ?? "").trim();
      if (id) hints.set(hintKey(provider.id, "series", id), raw);
    }
  });
  return hints;
}

async function loadOfficialImdbTitleMatches(candidates: PreparedCandidate[]) {
  const matches = new Map<string, ImdbTitleBasicsRow[]>();
  if (candidates.length === 0) return matches;
  const candidatesByTitle = new Map<string, PreparedCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizeImdbLookupTitle(candidate.title);
    if (!key) continue;
    const entries = candidatesByTitle.get(key) ?? [];
    entries.push(candidate);
    candidatesByTitle.set(key, entries);
  }

  const datasetUrl = process.env.IMDB_BASICS_DATASET_URL?.trim() || DEFAULT_BASICS_DATASET_URL;
  const response = await fetch(datasetUrl, {
    cache: "no-store",
    headers: { "User-Agent": "Zende/0.1 IMDb title matching" },
    signal: AbortSignal.timeout(DATASET_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) throw new Error(`IMDb title basics dataset failed (${response.status}).`);

  let scanned = 0;
  const compressed = Readable.fromWeb(response.body as never);
  const lines = createInterface({ input: compressed.pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    scanned += 1;
    if (scanned % 2_000_000 === 0) log.info("IMDb title basics scan progress", { scanned, matchedCandidates: matches.size });
    const title = parseImdbTitleBasicsRow(line);
    if (!title || title.isAdult) continue;
    const keys = new Set([
      normalizeImdbLookupTitle(title.primaryTitle), normalizeImdbLookupTitle(title.originalTitle),
    ]);
    const seenCandidates = new Set<string>();
    for (const key of keys) {
      const wanted = candidatesByTitle.get(key);
      if (!wanted) continue;
      for (const candidate of wanted) {
        if (seenCandidates.has(candidate.id) || !imdbTitleTypeMatchesMedia(title.titleType, candidate.mediaType)) continue;
        seenCandidates.add(candidate.id);
        const existing = matches.get(candidate.id) ?? [];
        if (existing.length >= MAX_MATCHES_PER_CANDIDATE) continue;
        existing.push(title);
        matches.set(candidate.id, existing);
      }
    }
  }
  log.info("IMDb title basics scan finished", { scanned, matchedCandidates: matches.size });
  return matches;
}

async function loadOfficialImdbRatings(wantedIds: Set<string>) {
  const matches = new Map<string, ImdbRatingRow>();
  if (wantedIds.size === 0) return matches;
  const datasetUrl = process.env.IMDB_RATINGS_DATASET_URL?.trim() || DEFAULT_RATINGS_DATASET_URL;
  const response = await fetch(datasetUrl, {
    cache: "no-store",
    headers: { "User-Agent": "Zende/0.1 IMDb ratings refresh" },
    signal: AbortSignal.timeout(DATASET_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) throw new Error(`IMDb ratings dataset failed (${response.status}).`);

  const compressed = Readable.fromWeb(response.body as never);
  const lines = createInterface({ input: compressed.pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    const row = parseImdbRatingRow(line);
    if (!row || !wantedIds.has(row.imdbId)) continue;
    matches.set(row.imdbId, row);
    if (matches.size === wantedIds.size) break;
  }
  lines.close();
  compressed.destroy();
  return matches;
}

function chooseTitleMatch(candidate: PreparedCandidate, possible: ImdbTitleBasicsRow[], ratings: Map<string, ImdbRatingRow>) {
  if (possible.length === 0) return null;
  let pool = possible;
  if (candidate.year) {
    const expected = Number(candidate.year);
    const exact = possible.filter((match) => Number(match.year) === expected);
    const nearby = possible.filter((match) => Math.abs(Number(match.year) - expected) <= 1);
    if (exact.length > 0) pool = exact;
    else if (nearby.length > 0) pool = nearby;
    else if (!(possible.length === 1 && possible[0]?.year == null)) return null;
  }
  return [...pool].sort((left, right) =>
    (ratings.get(right.imdbId)?.votes ?? 0) - (ratings.get(left.imdbId)?.votes ?? 0),
  )[0] ?? null;
}

function minimalMetadata(candidate: PreparedCandidate, fetchedAt: Date): MediaMetadata {
  return {
    mediaType: candidate.mediaType,
    source: "portal",
    title: candidate.title,
    ...(candidate.year ? { year: candidate.year } : {}),
    genres: [], scores: [], cast: [], fetchedAt: fetchedAt.toISOString(),
  };
}

async function runJob(): Promise<ImdbRatingsJobResult> {
  const started = Date.now();
  const rows = await prisma.iptvProviderChannel.findMany({
    where: { provider: { enabled: true } },
    select: {
      id: true, name: true, url: true, duration: true, contentType: true, groupTitle: true,
      provider: { select: { id: true, kind: true, serverUrl: true, username: true, password: true } },
      mediaMetadata: { select: { imdbId: true, imdbMatchAttemptedAt: true, payloadJson: true, fetchedAt: true } },
    },
  });

  let adultSkipped = 0;
  const candidates: Candidate[] = rows.flatMap((row) => {
    const contentType = resolveLibraryContentType({
      name: row.name, url: row.url, duration: row.duration,
      ...(row.contentType === "live" || row.contentType === "movie" || row.contentType === "series" ? { contentType: row.contentType } : {}),
      ...(row.groupTitle ? { groupTitle: row.groupTitle } : {}),
    });
    if (contentType !== "movie" && contentType !== "series") return [];
    if (isAdultContentChannel(row)) { adultSkipped += 1; return []; }
    return [{ ...row, contentType }];
  });

  const portalHints = await loadXtreamMetadataHints(candidates);
  const now = new Date();
  const retryBefore = now.getTime() - MATCH_RETRY_AGE_MS;
  const prepared: PreparedCandidate[] = candidates.map((candidate) => {
    const parsed = parseChannelLabel(candidate.name);
    const externalId = externalIdForCandidate(candidate);
    const portalInfo = externalId ? portalHints.get(hintKey(candidate.provider.id, candidate.contentType, externalId)) : undefined;
    const rawTitle =
      firstText(portalInfo, ["name", "title", "o_name", "original_name"]) ??
      candidate.name;
    const portalParsed = parseChannelLabel(rawTitle);
    const title = cleanProviderTitle(rawTitle);
    const directImdbId = imdbIdFromHint(portalInfo);
    const lastAttempt = candidate.mediaMetadata?.imdbMatchAttemptedAt?.getTime() ?? 0;
    return {
      ...candidate,
      mediaType: candidate.contentType === "movie" ? "movie" : "tv",
      title,
      year: yearFromHint(portalInfo, portalParsed.yearLabel ?? parsed.yearLabel),
      directImdbId,
      shouldAttemptMatch: !candidate.mediaMetadata?.imdbId && !directImdbId && lastAttempt < retryBefore,
    };
  });

  const unresolved = prepared.filter((candidate) => candidate.shouldAttemptMatch);
  log.info("IMDb title matching started", { candidates: prepared.length, adultSkipped, basicsAttempted: unresolved.length });
  const titleMatches = await loadOfficialImdbTitleMatches(unresolved);
  const possibleIds = new Set<string>();
  for (const candidate of prepared) {
    const knownId = candidate.mediaMetadata?.imdbId?.trim() || candidate.directImdbId;
    if (knownId) possibleIds.add(knownId);
    for (const match of titleMatches.get(candidate.id) ?? []) possibleIds.add(match.imdbId);
  }
  const ratings = await loadOfficialImdbRatings(possibleIds);

  const selectedIds = new Map<string, string>();
  let existingIds = 0;
  let directIds = 0;
  let basicsMatched = 0;
  for (const candidate of prepared) {
    const existingId = candidate.mediaMetadata?.imdbId?.trim();
    if (existingId) { selectedIds.set(candidate.id, existingId); existingIds += 1; continue; }
    if (candidate.directImdbId) { selectedIds.set(candidate.id, candidate.directImdbId); directIds += 1; continue; }
    const match = chooseTitleMatch(candidate, titleMatches.get(candidate.id) ?? [], ratings);
    if (match) { selectedIds.set(candidate.id, match.imdbId); basicsMatched += 1; }
  }

  let updated = 0;
  for (const candidateChunk of chunks(prepared, 100)) {
    const writes = candidateChunk.flatMap((candidate) => {
      const imdbId = selectedIds.get(candidate.id);
      if (!imdbId && !candidate.shouldAttemptMatch) return [];
      const rating = imdbId ? ratings.get(imdbId) : undefined;
      const existingPayload = candidate.mediaMetadata ? parseMediaMetadataPayload(candidate.mediaMetadata.payloadJson) : null;
      let metadata: MediaMetadata = existingPayload ?? minimalMetadata(candidate, now);
      if (imdbId) metadata = { ...metadata, imdbId };
      if (rating) metadata = withImdbRating(metadata, rating.rating, rating.votes);
      updated += 1;
      return [prisma.mediaMetadataCache.upsert({
        where: { mediaKey: `channel:${candidate.id}` },
        create: {
          mediaKey: `channel:${candidate.id}`, providerChannelId: candidate.id,
          mediaType: candidate.mediaType, title: metadata.title,
          imdbId: imdbId ?? null, imdbRating: rating?.rating ?? null, imdbVotes: rating?.votes ?? null,
          imdbRatingFetchedAt: rating ? now : null,
          imdbMatchAttemptedAt: candidate.shouldAttemptMatch ? now : null,
          payloadJson: JSON.stringify(metadata), fetchedAt: now,
        },
        update: {
          ...(imdbId ? { imdbId } : {}),
          ...(rating ? { imdbRating: rating.rating, imdbVotes: rating.votes, imdbRatingFetchedAt: now } : {}),
          ...(candidate.shouldAttemptMatch ? { imdbMatchAttemptedAt: now } : {}),
          payloadJson: JSON.stringify(metadata),
        },
      })];
    });
    if (writes.length > 0) await prisma.$transaction(writes);
  }

  invalidateLibraryCatalogCache();
  const result = {
    candidates: prepared.length, adultSkipped, existingIds, directIds,
    basicsAttempted: unresolved.length, basicsMatched,
    unmatched: unresolved.length - basicsMatched,
    imdbIds: selectedIds.size,
    datasetMatched: [...selectedIds.values()].filter((id) => ratings.has(id)).length,
    updated, elapsedMs: Date.now() - started,
  };
  log.info("nightly IMDb ratings refresh finished", result);
  return result;
}

let running: Promise<ImdbRatingsJobResult> | null = null;

/** De-duplicate manual cron calls and the built-in nightly scheduler. */
export function runImdbRatingsJob(): Promise<ImdbRatingsJobResult> {
  if (running) return running;
  running = runJob().finally(() => { running = null; });
  return running;
}
