import "server-only";

import { getProviderXmltvIndex } from "@/lib/epg/provider-xmltv-index";
import { expandChannelIdVariants } from "@/lib/epg/xmltv-parse";
import {
  buildXmltvDocument,
  type XmltvChannelRef,
  type XmltvProgrammeRef,
} from "@/lib/iptv/xmltv-guide";
import type { ThreadfinCatalogRow } from "@/lib/threadfin/catalog";
import { threadfinGuideId } from "@/lib/threadfin/guide-id";

const HOUR_MS = 60 * 60 * 1000;
const PLACEHOLDER_HOURS = 7 * 24;
const PROVIDER_EPG_WAIT_MS = 15_000;

function fallbackProgrammes(row: ThreadfinCatalogRow, channelId: string): XmltvProgrammeRef[] {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  const title = row.kind === "live" ? "No programme data" : row.name;
  const description =
    row.kind === "live"
      ? "No schedule is available from the IPTV provider."
      : "Favorite on-demand title — select this Plex channel to play.";
  return Array.from({ length: PLACEHOLDER_HOURS }, (_, slot) => ({
    channelId,
    title,
    description,
    startMs: start.getTime() + slot * HOUR_MS,
    stopMs: start.getTime() + (slot + 1) * HOUR_MS,
  }));
}

export async function buildThreadfinXmltv(
  rows: ThreadfinCatalogRow[],
  imageOrigin: string,
): Promise<{ xml: string; channels: number; programmes: number; providerMatched: number }> {
  const channels: XmltvChannelRef[] = rows.map((row) => ({
    cid: threadfinGuideId(row.kind, row.streamId),
    name: row.name,
    logo: row.tvgLogo,
  }));
  const programmes: XmltvProgrammeRef[] = [];
  let providerMatched = 0;
  let providerIndex: Awaited<ReturnType<typeof getProviderXmltvIndex>> | null = null;
  try {
    providerIndex = await Promise.race([
      getProviderXmltvIndex(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Provider XMLTV warm-up timed out")), PROVIDER_EPG_WAIT_MS);
      }),
    ]);
  } catch {
    // Never block Threadfin's source import on a very large or slow provider
    // guide. The background index load can populate real schedules next time.
  }

  for (const row of rows) {
    const channelId = threadfinGuideId(row.kind, row.streamId);
    let providerRows = row.kind === "live" && providerIndex && row.tvgId
      ? expandChannelIdVariants(row.tvgId)
          .map((variant) => providerIndex!.programmesByChannel.get(variant.toLowerCase()))
          .find((candidate) => candidate && candidate.length > 0)
      : undefined;

    if (!providerRows?.length && row.kind === "live" && providerIndex) {
      const wantedName = row.name.trim().toLowerCase();
      const matchingId = [...providerIndex.channelNames.entries()].find(
        ([, name]) => name.trim().toLowerCase() === wantedName,
      )?.[0];
      if (matchingId) providerRows = providerIndex.programmesByChannel.get(matchingId);
    }

    if (providerRows?.length) {
      providerMatched += 1;
      programmes.push(
        ...providerRows.map((programme) => ({
          channelId,
          title: programme.title,
          description: programme.description,
          startMs: programme.startMs,
          stopMs: programme.stopMs,
        })),
      );
    } else {
      programmes.push(...fallbackProgrammes(row, channelId));
    }
  }

  return {
    xml: buildXmltvDocument(channels, imageOrigin, programmes),
    channels: channels.length,
    programmes: programmes.length,
    providerMatched,
  };
}
