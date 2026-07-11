import "server-only";

import type { ILogger } from "@/core/logging/types";
import {
  assertAllowedEpgUrl,
  listEpgGuideUrls,
} from "@/lib/epg/epg-sources";
import {
  getIptvOrgSiteIdLookup,
  resolveXmltvSiteId,
  stripTvgFeedSuffix,
} from "@/lib/epg/iptv-org-channel-map";
import { collectProgrammesForXmltvIds } from "@/lib/epg/iptvx-noarch-stream";
import {
  expandChannelIdVariants,
  parseXmltvProgrammes,
  pickNowNextForChannels,
  type XmltvNowNext,
  type XmltvProgramme,
} from "@/lib/epg/xmltv-parse";

export const EPG_MAX_IDS = 48;

/** Raw merged programmes for a set of channel ids (safe to cache; re-run now/next per request). */
export type EpgMergeForIds = {
  programmes: XmltvProgramme[];
  sources: string[];
  fetchedAt: number;
};

export type EpgProgramsPayload = {
  programs: Record<string, XmltvNowNext>;
  sources: string[];
  fetchedAt: number;
};

export async function loadEpgMergeForIds(
  ids: string[],
  log: ILogger,
): Promise<EpgMergeForIds> {
  const programmes: XmltvProgramme[] = [];

  const urls = listEpgGuideUrls().filter((u) => assertAllowedEpgUrl(u));

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/xml, text/xml, */*",
          "User-Agent":
            "Zende/0.1 (EPG; https://github.com/iptv-org/epg community guides)",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        log.warn("EPG guide fetch failed", { url, status: res.status });
        continue;
      }
      const xml = await res.text();
      programmes.push(...parseXmltvProgrammes(xml));
    } catch (e) {
      log.warn("EPG guide fetch error", {
        url,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  let lookup: Record<string, string> = {};
  try {
    lookup = await getIptvOrgSiteIdLookup();
  } catch (e) {
    log.warn("iptv-org guides.json lookup failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const siteIdsForIptvx = new Set<string>();
  for (const id of ids) {
    const sid = resolveXmltvSiteId(id, lookup);
    if (sid) siteIdsForIptvx.add(sid);
    const stripped = stripTvgFeedSuffix(id.trim());
    if (stripped) {
      siteIdsForIptvx.add(stripped.replace(/\./g, "-").toLowerCase());
      siteIdsForIptvx.add(stripped.toLowerCase());
    }
  }

  if (siteIdsForIptvx.size > 0) {
    try {
      const iptvxRows = await collectProgrammesForXmltvIds(siteIdsForIptvx);
      programmes.push(...iptvxRows);
    } catch (e) {
      log.warn("iptvx consolidated EPG stream failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const safeSourceRefs = urls.map((u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return "guide";
    }
  });

  return {
    programmes,
    sources: [
      ...safeSourceRefs,
      ...(siteIdsForIptvx.size > 0 ? ["iptvx-consolidated"] : []),
    ],
    fetchedAt: Date.now(),
  };
}

function channelIdCanonicalIndex(
  programmes: XmltvProgramme[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of programmes) {
    const id = p.channelId;
    if (!m.has(id)) m.set(id, id);
    const lo = id.toLowerCase();
    if (!m.has(lo)) m.set(lo, id);
  }
  return m;
}

function firstCanonicalChannelId(
  variants: string[],
  index: Map<string, string>,
): string | null {
  for (const v of variants) {
    const hit = index.get(v) ?? index.get(v.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export async function materializeProgramsFromMerge(
  merge: EpgMergeForIds,
  ids: string[],
  log: ILogger,
): Promise<EpgProgramsPayload> {
  let lookup: Record<string, string> = {};
  try {
    lookup = await getIptvOrgSiteIdLookup();
  } catch (e) {
    log.warn("iptv-org guides.json lookup failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const channelIndex = channelIdCanonicalIndex(merge.programmes);
  const nowMs = Date.now();
  const programs: Record<string, XmltvNowNext> = {};

  for (const requested of ids) {
    const resolvedSite = resolveXmltvSiteId(requested, lookup);
    const variants = [
      ...expandChannelIdVariants(requested),
      ...(resolvedSite ? [resolvedSite] : []),
    ];
    const resolved = firstCanonicalChannelId(variants, channelIndex);
    if (!resolved) {
      programs[requested] = { current: null, next: null };
      continue;
    }
    const forChannel = merge.programmes.filter((p) => p.channelId === resolved);
    const map = pickNowNextForChannels(forChannel, [resolved], nowMs);
    programs[requested] =
      map.get(resolved) ??
      ({ current: null, next: null } satisfies XmltvNowNext);
  }

  return {
    programs,
    sources: merge.sources,
    fetchedAt: merge.fetchedAt,
  };
}

export async function computeEpgProgramsForIds(
  ids: string[],
  log: ILogger,
): Promise<EpgProgramsPayload> {
  const merge = await loadEpgMergeForIds(ids, log);
  return materializeProgramsFromMerge(merge, ids, log);
}
