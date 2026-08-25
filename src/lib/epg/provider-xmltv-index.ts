import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { fetchXtreamXmltv } from "@/lib/iptv/xtream-client";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import {
  parseProviderXmltvChannelBlock,
  parseProviderXmltvProgrammeBlock,
  type ProviderXmltvProgramme,
} from "@/lib/epg/provider-xmltv-parse";

const log = createServerLogger("lib.epg.providerXmltvIndex");
const CACHE_MS = 30 * 60 * 1000;
const PAST_WINDOW_MS = 6 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ProviderXmltvIndex = {
  channelNames: Map<string, string>;
  programmesByChannel: Map<string, ProviderXmltvProgramme[]>;
  fetchedAt: number;
  programmeCount: number;
};

let cached: ProviderXmltvIndex | null = null;
let inflight: Promise<ProviderXmltvIndex> | null = null;
let generation = 0;

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

async function buildProviderXmltvIndex(): Promise<ProviderXmltvIndex> {
  const credentials = await loadXtreamPortalCredentials();
  if (!credentials) throw new Error("No imported Xtream provider is configured.");
  const response = await fetchXtreamXmltv(credentials);
  if (!response?.body) throw new Error("Provider XMLTV is unavailable.");

  const started = Date.now();
  const minTime = started - PAST_WINDOW_MS;
  const maxTime = started + FUTURE_WINDOW_MS;
  const channelNames = new Map<string, string>();
  const programmesByChannel = new Map<string, ProviderXmltvProgramme[]>();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  let programmeCount = 0;

  const consume = (flush = false) => {
    while (true) {
      const block = nextBlock(buffer);
      if (!block) break;
      const raw = buffer.slice(block.start, block.end);
      buffer = buffer.slice(block.end);
      if (block.kind === "channel") {
        const channel = parseProviderXmltvChannelBlock(raw);
        if (channel) channelNames.set(channel.id.toLowerCase(), channel.name);
        continue;
      }
      const programme = parseProviderXmltvProgrammeBlock(raw);
      if (!programme || programme.stopMs < minTime || programme.startMs > maxTime) continue;
      const key = programme.channelId.toLowerCase();
      const rows = programmesByChannel.get(key) ?? [];
      rows.push(programme);
      programmesByChannel.set(key, rows);
      programmeCount += 1;
    }
    if (buffer.length > 2_000_000 || flush) {
      const lastStart = Math.max(
        buffer.toLowerCase().lastIndexOf("<channel"),
        buffer.toLowerCase().lastIndexOf("<programme"),
      );
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

  const index = {
    channelNames,
    programmesByChannel,
    fetchedAt: Date.now(),
    programmeCount,
  };
  log.info("provider XMLTV index built", {
    bytes,
    channels: channelNames.size,
    programmeChannels: programmesByChannel.size,
    programmes: programmeCount,
    elapsedMs: Date.now() - started,
  });
  return index;
}

export async function getProviderXmltvIndex(): Promise<ProviderXmltvIndex> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
  if (!inflight) {
    const loadGeneration = generation;
    inflight = buildProviderXmltvIndex()
      .then((value) => {
        if (loadGeneration === generation) cached = value;
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function getProviderXmltvCacheStats() {
  if (cached && Date.now() - cached.fetchedAt >= CACHE_MS) cached = null;
  return {
    entries: cached ? 1 : 0,
    channels: cached?.channelNames.size ?? 0,
    programmes: cached?.programmeCount ?? 0,
    inFlight: inflight ? 1 : 0,
    ttlMs: CACHE_MS,
  };
}

export function clearProviderXmltvCache(): void {
  generation += 1;
  cached = null;
  inflight = null;
}
