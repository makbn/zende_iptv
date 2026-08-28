import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  getProviderXmltvIndex,
  resolveProviderGuideKey,
} from "@/lib/epg/provider-xmltv-index";
import { lookupEnabledProviderChannelsByUrls } from "@/lib/iptv/provider-store";
import {
  isChannelParentalBlocked,
  resolveParentalAccess,
} from "@/lib/parental/parental-control-store";

export const runtime = "nodejs";

type Body = {
  providerId?: unknown;
  tvgId?: unknown;
  url?: unknown;
};

function responseProgramme(
  guideKey: string,
  programme: {
    title: string;
    description: string;
    startMs: number;
    stopMs: number;
  } | null,
) {
  return programme
    ? {
        id: `${guideKey}:${programme.startMs}`,
        title: programme.title,
        description: programme.description,
        startMs: programme.startMs,
        stopMs: programme.stopMs,
      }
    : null;
}

/** Current and next programme lookup from the active provider index only. */
export async function POST(request: Request) {
  const started = performance.now();
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let providerId = typeof body.providerId === "string" ? body.providerId.trim() : "";
  let tvgId = typeof body.tvgId === "string" ? body.tvgId.trim() : "";
  const channelUrl = typeof body.url === "string" ? body.url.trim() : "";
  if ((!providerId || !tvgId) && !channelUrl) {
    return NextResponse.json(
      { error: "providerId and tvgId, or a channel URL, are required." },
      { status: 400 },
    );
  }

  const log = createServerLogger("api.epg.channel");
  try {
    const [index, parental] = await Promise.all([
      getProviderXmltvIndex(),
      resolveParentalAccess(request, gate),
    ]);
    let guideKey = providerId && tvgId
      ? resolveProviderGuideKey(index, providerId, tvgId)
      : null;

    // Playback sessions created before provider metadata was attached still
    // carry the canonical stream URL. Resolve that URL against the provider
    // database so the player uses the same authoritative channel ID as Guide.
    if (!guideKey && channelUrl) {
      const channel = (await lookupEnabledProviderChannelsByUrls([channelUrl])).get(channelUrl);
      const resolvedProviderId = channel?.providerId?.trim() ?? "";
      const resolvedTvgId = channel?.tvgId?.trim() ?? "";
      if (resolvedProviderId && resolvedTvgId) {
        providerId = resolvedProviderId;
        tvgId = resolvedTvgId;
        guideKey = resolveProviderGuideKey(index, providerId, tvgId);
      }
    }

    const entry = guideKey ? index.guideChannels.get(guideKey) : null;
    if (!guideKey || !entry || isChannelParentalBlocked(entry.channel, parental.blockedPatterns)) {
      return NextResponse.json(
        {
          available: false,
          identityAvailable: Boolean(providerId && tvgId),
          current: null,
          next: null,
          indexVersion: index.version,
          providerId: providerId || null,
          tvgId: tvgId || null,
        },
        { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } },
      );
    }

    const now = Date.now();
    const schedule = index.programmesByGuideKey.get(guideKey) ?? [];
    const current = schedule.find(
      (programme) => programme.startMs <= now && programme.stopMs > now,
    ) ?? null;
    const next = schedule.find((programme) => programme.startMs > now) ?? null;
    const elapsedMs = performance.now() - started;
    log.debug("player EPG served from provider index", {
      providerId,
      tvgId,
      indexVersion: index.version,
      elapsedMs,
    });

    return NextResponse.json(
      {
        available: Boolean(current || next),
        identityAvailable: true,
        current: responseProgramme(guideKey, current),
        next: responseProgramme(guideKey, next),
        indexVersion: index.version,
        providerId,
        tvgId,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie, Authorization",
          "X-Zende-Epg-Index": index.version,
          "X-Zende-Epg-Lookup-Ms": elapsedMs.toFixed(1),
          "Server-Timing": `epg;dur=${elapsedMs.toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    log.error("player EPG lookup failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not load channel programme data." }, { status: 502 });
  }
}
