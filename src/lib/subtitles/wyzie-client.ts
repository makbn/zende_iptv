import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { getWyzieApiKey, wyzieApiBase } from "@/lib/subtitles/wyzie-config";
import type { SubtitleSearchQuery, SubtitleSearchResult } from "@/lib/subtitles/types";

const log = createServerLogger("lib.subtitles.wyzie");

export class WyzieRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WyzieRequestError";
    this.status = status;
  }
}

type WyzieSubtitleItem = {
  id?: string;
  url?: string;
  display?: string;
  language?: string;
  media?: string;
  isHearingImpaired?: boolean;
  source?: string;
  release?: string;
  fileName?: string;
  downloadCount?: number;
  format?: string;
  origin?: string;
  ai?: boolean;
};

function normalizeLanguageCode(code: string): string {
  return code.trim().toLowerCase().replace("_", "-");
}

function languageName(code: string, display?: string): string {
  if (display?.trim()) return display.trim();
  return code.toUpperCase();
}

export function resolveWyzieMediaId(query: SubtitleSearchQuery): string | null {
  const rawImdb = query.imdbId?.trim();
  if (rawImdb) {
    // Wyzie expects IMDb ids in ttNNNN format. If imdbId is numeric,
    // prefer tmdbId when present instead of coercing to an invalid tt id.
    if (/^tt\d+$/i.test(rawImdb)) {
      return rawImdb.toLowerCase();
    }
    if (/^\d+$/.test(rawImdb) && query.tmdbId?.trim()) {
      return query.tmdbId.trim();
    }
  }
  if (query.tmdbId?.trim()) return query.tmdbId.trim();
  if (rawImdb && /^\d+$/.test(rawImdb)) return rawImdb;
  return null;
}

function mapSearchItem(item: WyzieSubtitleItem): SubtitleSearchResult | null {
  if (!item.id || !item.url) return null;
  const language = normalizeLanguageCode(item.language ?? "und");
  return {
    id: item.id,
    url: item.url,
    language,
    languageName: languageName(language, item.display),
    release: item.release?.trim() || item.fileName?.trim() || item.media?.trim() || "Unknown release",
    downloadCount: item.downloadCount ?? 0,
    hearingImpaired: Boolean(item.isHearingImpaired),
    format: item.format,
    source: item.source,
    featureTitle: item.media,
  };
}

export async function searchWyzieSubtitles(
  query: SubtitleSearchQuery,
): Promise<SubtitleSearchResult[]> {
  const apiKey = await getWyzieApiKey();
  if (!apiKey) throw new Error("Wyzie API key is not configured.");

  const mediaId = resolveWyzieMediaId(query);
  if (!mediaId) {
    throw new Error("Subtitle search needs an IMDb id (tt…) or TMDB id for this title.");
  }

  const params = new URLSearchParams();
  params.set("id", mediaId);
  params.set("key", apiKey);
  params.set("format", "srt");
  params.set("encoding", "utf-8");

  if (query.languages?.trim()) {
    params.set(
      "language",
      query.languages
        .split(",")
        .map((part) => normalizeLanguageCode(part))
        .filter(Boolean)
        .join(","),
    );
  }

  if (query.season != null && query.season > 0 && query.episode != null && query.episode > 0) {
    params.set("season", String(query.season));
    params.set("episode", String(query.episode));
  }

  if (query.releaseFilter?.trim()) {
    params.set("release", query.releaseFilter.trim());
  }

  const url = `${wyzieApiBase()}/search?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as
    | WyzieSubtitleItem[]
    | { message?: string; code?: number };

  if (!res.ok) {
    const message =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof body.message === "string"
        ? body.message
        : `Subtitle search failed (${res.status}).`;
    log.warn("Wyzie search failed", { status: res.status, mediaId });
    throw new WyzieRequestError(message, res.status);
  }

  const items = Array.isArray(body) ? body : [];
  return items
    .filter((item) => item.ai !== true)
    .map(mapSearchItem)
    .filter((item): item is SubtitleSearchResult => item != null)
    .sort((a, b) => b.downloadCount - a.downloadCount);
}

export async function fetchWyzieSubtitlePayload(
  downloadUrl: string,
): Promise<{ text: string; fileName?: string }> {
  const res = await fetch(downloadUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Subtitle download failed (${res.status}).`);
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new Error("Compressed subtitle archives are not supported yet. Try another release.");
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const fileName = downloadUrl.split("/").pop()?.split("?")[0];
  return { text, fileName };
}
