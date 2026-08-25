import "server-only";

import type { ILogger } from "@/core/logging/types";
import { loadManualChannelRows } from "@/lib/channels/manual-channels-db";
import { fetchXtreamShortEpg } from "@/lib/iptv/xtream-client";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import {
  parseXtreamCredentialsFromStreamUrl,
  parseXtreamLiveIdFromStreamUrl,
} from "@/lib/iptv/xtream-url";
import type { XtreamCredentials } from "@/lib/iptv/xtream-types";
import type { XmltvProgramme } from "@/lib/epg/xmltv-parse";
import { parseXtreamEpgListings } from "@/lib/epg/xtream-provider-epg-parse";

export type XtreamProviderEpgResult = {
  programmes: XmltvProgramme[];
  matchedIds: Set<string>;
};

function portalMatches(url: string, creds: XtreamCredentials): boolean {
  const embedded = parseXtreamCredentialsFromStreamUrl(url);
  if (!embedded || embedded.username !== creds.username) return false;
  try {
    return new URL(embedded.serverUrl).host.toLowerCase() ===
      new URL(creds.serverUrl).host.toLowerCase();
  } catch {
    return false;
  }
}

async function runLimited<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

/** Resolve requested provider EPG ids through locally imported Xtream stream URLs. */
export async function loadXtreamProviderEpg(
  ids: string[],
  log: ILogger,
): Promise<XtreamProviderEpgResult> {
  const empty = { programmes: [], matchedIds: new Set<string>() };
  const creds = await loadXtreamPortalCredentials();
  if (!creds || ids.length === 0) return empty;

  const requested = new Map(ids.map((id) => [id.trim().toLowerCase(), id.trim()]));
  const candidates = new Map<string, { channelId: string; streamId: string }>();
  const rows = await loadManualChannelRows();

  for (const row of rows) {
    const tvgId = row.channel.tvgId?.trim();
    if (!tvgId) continue;
    const channelId = requested.get(tvgId.toLowerCase());
    if (!channelId || candidates.has(channelId)) continue;
    if (!portalMatches(row.channel.url, creds)) continue;
    const streamId = parseXtreamLiveIdFromStreamUrl(row.channel.url);
    if (streamId) candidates.set(channelId, { channelId, streamId });
  }

  const programmes: XmltvProgramme[] = [];
  const matchedIds = new Set<string>();
  await runLimited([...candidates.values()], 6, async ({ channelId, streamId }) => {
    try {
      const listings = await fetchXtreamShortEpg(creds, streamId, 16);
      if (!listings) return;
      const parsed = parseXtreamEpgListings(listings, channelId);
      if (parsed.length === 0) return;
      programmes.push(...parsed);
      matchedIds.add(channelId);
    } catch (error) {
      log.warn("provider short EPG failed", {
        channelId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  if (programmes.length > 0) {
    log.info("provider EPG loaded", {
      requested: ids.length,
      matched: matchedIds.size,
      programmes: programmes.length,
    });
  }
  return { programmes, matchedIds };
}
