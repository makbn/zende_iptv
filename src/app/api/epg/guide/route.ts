import { NextResponse } from "next/server";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  canonicalEpgId,
  getProviderXmltvIndex,
  providerGuideKey,
  searchProviderGuideDocuments,
  tokenizeGuideSearch,
} from "@/lib/epg/provider-xmltv-index";
import {
  isChannelParentalBlocked,
  resolveParentalAccess,
} from "@/lib/parental/parental-control-store";

export const runtime = "nodejs";
export const maxDuration = 120;

type PreferredChannel = {
  providerId?: unknown;
  tvgId?: unknown;
};

type Body = {
  query?: unknown;
  preferred?: unknown;
  /** Backward compatibility for clients loaded before the provider-scoped API. */
  preferredIds?: unknown;
  limit?: unknown;
  detailId?: unknown;
  detailProviderId?: unknown;
};

export async function POST(request: Request) {
  const requestStarted = performance.now();
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const authFinished = performance.now();
  const parental = await resolveParentalAccess(request, gate);
  const parentalFinished = performance.now();
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const queryTerms = tokenizeGuideSearch(query);
  const detailId = typeof body.detailId === "string" ? canonicalEpgId(body.detailId) : "";
  const detailProviderId =
    typeof body.detailProviderId === "string" ? body.detailProviderId.trim() : "";
  const preferred = Array.isArray(body.preferred)
    ? body.preferred.flatMap((value): Array<{ providerId: string; tvgId: string }> => {
        if (!value || typeof value !== "object") return [];
        const row = value as PreferredChannel;
        const providerId = typeof row.providerId === "string" ? row.providerId.trim() : "";
        const tvgId = typeof row.tvgId === "string" ? canonicalEpgId(row.tvgId) : "";
        return providerId && tvgId ? [{ providerId, tvgId }] : [];
      })
    : [];
  const legacyPreferredIds = Array.isArray(body.preferredIds)
    ? body.preferredIds
        .filter((value): value is string => typeof value === "string")
        .map(canonicalEpgId)
    : [];
  const limit = Math.min(60, Math.max(1, Number(body.limit) || 36));
  const log = createServerLogger("api.epg.guide");
  const bodyParsed = performance.now();

  try {
    const index = await getProviderXmltvIndex();
    const indexFinished = performance.now();
    const preferredRank = new Map<string, number>();
    preferred.forEach((row, rank) => {
      preferredRank.set(providerGuideKey(row.providerId, row.tvgId), rank);
    });
    const legacyRank = new Map(legacyPreferredIds.map((id, rank) => [id, rank]));
    const searchMatches = queryTerms.length > 0
      ? searchProviderGuideDocuments(index, query)
      : null;
    const postingsFinished = performance.now();

    let candidateKeys: Set<string>;
    if (detailId) {
      candidateKeys = detailProviderId
        ? new Set([providerGuideKey(detailProviderId, detailId)])
        : new Set(
            [...index.guideChannels.entries()]
              .filter(([, entry]) => entry.epgId === detailId)
              .map(([key]) => key),
          );
    } else if (queryTerms.length > 0) {
      candidateKeys = searchMatches!.guideKeys;
    } else if (preferredRank.size > 0) {
      candidateKeys = new Set(preferredRank.keys());
    } else if (legacyRank.size > 0) {
      candidateKeys = new Set(
        [...index.guideChannels.entries()]
          .filter(([, entry]) => legacyRank.has(entry.epgId))
          .map(([key]) => key),
      );
    } else {
      candidateKeys = new Set(index.guideChannels.keys());
    }

    const now = Date.now();
    const rows: Array<{
      channel: M3uChannel;
      programmes: Array<{
        id: string;
        title: string;
        description: string;
        startMs: number;
        stopMs: number;
        matched: boolean;
      }>;
      channelMatched: boolean;
      matchCount: number;
      rank: number;
    }> = [];

    for (const key of candidateKeys) {
      const entry = index.guideChannels.get(key);
      if (!entry) continue;
      if (isChannelParentalBlocked(entry.channel, parental.blockedPatterns)) continue;
      const schedule = (index.programmesByGuideKey.get(key) ?? [])
        .map((programme, programmeIndex) => ({ programme, programmeIndex }))
        .filter(({ programme }) => programme.stopMs >= now - 60 * 60 * 1000);
      if (schedule.length === 0) continue;

      const channelMatched = searchMatches?.channelKeys.has(key) ?? false;
      const matchedProgrammeIndexes = searchMatches?.programmeIndexesByGuideKey.get(key);
      const matchedPrograms = matchedProgrammeIndexes
        ? schedule.filter(({ programmeIndex }) => matchedProgrammeIndexes.has(programmeIndex))
        : [];
      if (queryTerms.length > 0 && !channelMatched && matchedPrograms.length === 0) continue;

      const currentIndex = schedule.findIndex(
        ({ programme }) => programme.startMs <= now && programme.stopMs > now,
      );
      const summarySchedule = matchedPrograms.length > 0
        ? matchedPrograms.slice(0, 3)
        : currentIndex >= 0
          ? schedule.slice(currentIndex, currentIndex + 2)
          : schedule.filter(({ programme }) => programme.startMs > now).slice(0, 2);
      const responseSchedule = detailId ? schedule : summarySchedule;

      rows.push({
        channel: entry.channel,
        channelMatched,
        matchCount: matchedPrograms.length,
        rank: preferredRank.get(key) ?? legacyRank.get(entry.epgId) ?? Number.MAX_SAFE_INTEGER,
        programmes: responseSchedule.map(({ programme, programmeIndex }) => ({
          id: `${key}:${programme.startMs}`,
          title: programme.title,
          description: programme.description,
          startMs: programme.startMs,
          stopMs: programme.stopMs,
          matched: matchedProgrammeIndexes?.has(programmeIndex) ?? false,
        })),
      });
    }

    rows.sort((a, b) => {
      if (queryTerms.length === 0) {
        return a.rank - b.rank || a.channel.name.localeCompare(b.channel.name);
      }
      if (a.channelMatched !== b.channelMatched) return a.channelMatched ? -1 : 1;
      return b.matchCount - a.matchCount || a.channel.name.localeCompare(b.channel.name);
    });

    const materializeFinished = performance.now();
    const timings = {
      authMs: authFinished - requestStarted,
      parentalMs: parentalFinished - authFinished,
      parseMs: bodyParsed - parentalFinished,
      indexMs: indexFinished - bodyParsed,
      postingsMs: postingsFinished - indexFinished,
      materializeMs: materializeFinished - postingsFinished,
      totalMs: materializeFinished - requestStarted,
    };
    log.debug("guide index query served", {
      query,
      candidates: candidateKeys.size,
      total: rows.length,
      indexVersion: index.version,
      ...timings,
    });

    return NextResponse.json(
      {
        results: rows.slice(0, limit).map((row) => ({
          channel: row.channel,
          programmes: row.programmes,
          channelMatched: row.channelMatched,
          matchCount: row.matchCount,
        })),
        total: rows.length,
        query,
        fetchedAt: index.fetchedAt,
        indexVersion: index.version,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie, Authorization",
          "X-Zende-Epg-Index": index.version,
          "X-Zende-Epg-Search-Ms": timings.totalMs.toFixed(1),
          "Server-Timing": [
            `auth;dur=${timings.authMs.toFixed(1)}`,
            `parental;dur=${timings.parentalMs.toFixed(1)}`,
            `parse;dur=${timings.parseMs.toFixed(1)}`,
            `index;dur=${timings.indexMs.toFixed(1)}`,
            `postings;dur=${timings.postingsMs.toFixed(1)}`,
            `materialize;dur=${timings.materializeMs.toFixed(1)}`,
          ].join(", "),
        },
      },
    );
  } catch (error) {
    log.error("full guide query failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not load the provider guide index." }, { status: 502 });
  }
}
