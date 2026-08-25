import { NextResponse } from "next/server";

import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { getProviderXmltvIndex } from "@/lib/epg/provider-xmltv-index";
import { loadMergedLibraryCatalog } from "@/lib/library/catalog";
import {
  isChannelParentalBlocked,
  resolveParentalAccess,
} from "@/lib/parental/parental-control-store";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  query?: unknown;
  preferredIds?: unknown;
  limit?: unknown;
  detailId?: unknown;
};

function epgKey(value: string): string {
  const trimmed = value.trim();
  const suffix = trimmed.lastIndexOf("@");
  return (suffix > 0 ? trimmed.slice(0, suffix) : trimmed).toLowerCase();
}

function matchesSearchTerms(text: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const normalized = text.toLowerCase();
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.every((term) =>
    words.some((word) =>
      term.length <= 2 ? word === term : word.startsWith(term),
    ),
  );
}

export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const parental = await resolveParentalAccess(request, gate);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim().toLowerCase() : "";
  const queryTerms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  const detailId = typeof body.detailId === "string" ? epgKey(body.detailId) : "";
  const preferredIds = Array.isArray(body.preferredIds)
    ? body.preferredIds.filter((value): value is string => typeof value === "string").map(epgKey)
    : [];
  const limit = Math.min(60, Math.max(1, Number(body.limit) || 36));
  const presetId = BUILTIN_PLAYLIST_SOURCES[0]!.presetId;
  const log = createServerLogger("api.epg.guide");

  try {
    const [catalog, index] = await Promise.all([
      loadMergedLibraryCatalog(presetId),
      getProviderXmltvIndex(),
    ]);
    const allowedByEpgId = new Map<string, (typeof catalog)[number]>();
    for (const channel of catalog) {
      if (resolveLibraryContentType(channel) !== "live") continue;
      if (isChannelParentalBlocked(channel, parental.blockedPatterns)) continue;
      const tvgId = channel.tvgId?.trim();
      if (!tvgId) continue;
      const key = epgKey(tvgId);
      if (!allowedByEpgId.has(key)) allowedByEpgId.set(key, channel);
    }

    const preferredRank = new Map(preferredIds.map((id, index) => [id, index]));
    const now = Date.now();
    const rows: Array<{
      channel: (typeof catalog)[number];
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

    for (const [key, channel] of allowedByEpgId) {
      if (detailId && key !== detailId) continue;
      const schedule = (index.programmesByChannel.get(key) ?? []).filter(
        (programme) => programme.stopMs >= now - 60 * 60 * 1000,
      );
      if (schedule.length === 0) continue;
      const channelText = `${channel.name} ${channel.groupTitle ?? ""} ${channel.tvgId ?? ""}`.toLowerCase();
      const channelMatched = matchesSearchTerms(channelText, queryTerms);
      const matchedPrograms = query
        ? schedule.filter((programme) =>
            matchesSearchTerms(
              `${programme.title} ${programme.description}`,
              queryTerms,
            ),
          )
        : [];
      if (query && !channelMatched && matchedPrograms.length === 0) continue;
      if (!detailId && !query && preferredIds.length > 0 && !preferredRank.has(key)) continue;

      const currentIndex = schedule.findIndex(
        (programme) => programme.startMs <= now && programme.stopMs > now,
      );
      const summarySchedule = matchedPrograms.length > 0
        ? matchedPrograms.slice(0, 3)
        : currentIndex >= 0
          ? schedule.slice(currentIndex, currentIndex + 2)
          : schedule.filter((programme) => programme.startMs > now).slice(0, 2);
      const responseSchedule = detailId ? schedule : summarySchedule;

      rows.push({
        channel,
        channelMatched,
        matchCount: matchedPrograms.length,
        rank: preferredRank.get(key) ?? Number.MAX_SAFE_INTEGER,
        programmes: responseSchedule.map((programme) => ({
          id: `${key}:${programme.startMs}`,
          title: programme.title,
          description: programme.description,
          startMs: programme.startMs,
          stopMs: programme.stopMs,
          matched: Boolean(
            query &&
              matchesSearchTerms(
                `${programme.title} ${programme.description}`,
                queryTerms,
              ),
          ),
        })),
      });
    }

    rows.sort((a, b) => {
      if (!query) return a.rank - b.rank || a.channel.name.localeCompare(b.channel.name);
      if (a.channelMatched !== b.channelMatched) return a.channelMatched ? -1 : 1;
      return b.matchCount - a.matchCount || a.channel.name.localeCompare(b.channel.name);
    });

    return NextResponse.json({
      results: rows.slice(0, limit).map(({ rank: _rank, ...row }) => row),
      total: rows.length,
      query,
      fetchedAt: index.fetchedAt,
    });
  } catch (error) {
    log.error("full guide query failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not load the full provider guide." }, { status: 502 });
  }
}
