import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  assertAllowedEpgUrl,
  listEpgGuideUrls,
} from "@/lib/epg/epg-sources";
import {
  getIptvOrgSiteIdLookup,
  resolveXmltvSiteId,
} from "@/lib/epg/iptv-org-channel-map";
import { collectProgrammesForXmltvIds } from "@/lib/epg/iptvx-noarch-stream";
import {
  expandChannelIdVariants,
  parseXmltvProgrammes,
  pickNowNextForChannels,
  type XmltvNowNext,
} from "@/lib/epg/xmltv-parse";

export const runtime = "nodejs";

/** Allow consolidated iptvx scan + guides.json fetch on cold start. */
export const maxDuration = 120;

const MAX_IDS = 48;

type Body = {
  ids?: unknown;
};

export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const log = createServerLogger("api.epg.programs");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawIds = body.ids;
  if (!Array.isArray(rawIds) || rawIds.some((x) => typeof x !== "string")) {
    return NextResponse.json(
      { error: "Expected ids: string[]" },
      { status: 400 },
    );
  }

  const ids = [...new Set(rawIds.map((s) => s.trim()).filter(Boolean))].slice(
    0,
    MAX_IDS,
  );

  if (ids.length === 0) {
    return NextResponse.json({
      programs: {} as Record<string, XmltvNowNext>,
      sources: [] as string[],
      fetchedAt: Date.now(),
    });
  }

  const programmes = [];

  const urls = listEpgGuideUrls().filter((u) => assertAllowedEpgUrl(u));

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/xml, text/xml, */*",
          "User-Agent":
            "Zenede/0.1 (EPG; https://github.com/iptv-org/epg community guides)",
        },
        next: { revalidate: 900 },
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

  const channelIdsInXml = new Set(programmes.map((p) => p.channelId));
  const nowMs = Date.now();
  const programs: Record<string, XmltvNowNext> = {};

  for (const requested of ids) {
    const resolvedSite = resolveXmltvSiteId(requested, lookup);
    const variants = [
      ...expandChannelIdVariants(requested),
      ...(resolvedSite ? [resolvedSite] : []),
    ];
    const resolved = variants.find((v) => channelIdsInXml.has(v));
    if (!resolved) {
      programs[requested] = { current: null, next: null };
      continue;
    }
    const forChannel = programmes.filter((p) => p.channelId === resolved);
    const map = pickNowNextForChannels(forChannel, [resolved], nowMs);
    programs[requested] =
      map.get(resolved) ??
      ({ current: null, next: null } satisfies XmltvNowNext);
  }

  const safeSourceRefs = urls.map((u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return "guide";
    }
  });

  return NextResponse.json({
    programs,
    sources: [
      ...safeSourceRefs,
      ...(siteIdsForIptvx.size > 0 ? ["iptvx-consolidated"] : []),
    ],
    fetchedAt: Date.now(),
  });
}
