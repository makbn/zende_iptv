import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { fetchXtreamVodInfo } from "@/lib/iptv/xtream-client";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import {
  parseXtreamCredentialsFromStreamUrl,
  parseXtreamVodIdFromStreamUrl,
} from "@/lib/iptv/xtream-url";
import { parseXtreamDurationSeconds } from "@/lib/playback/stream-session-meta";

export const runtime = "nodejs";

const querySchema = z.object({
  vodId: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
});

/** Xtream `get_vod_info` — movie runtime and metadata for the seek bar. */
export async function GET(request: Request) {
  return withApiLogging("api.xtream.vod-info", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      vodId: url.searchParams.get("vodId") ?? undefined,
      url: url.searchParams.get("url") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    let vodId = parsed.data.vodId?.trim() ?? "";
    if (!vodId && parsed.data.url) {
      vodId = parseXtreamVodIdFromStreamUrl(parsed.data.url) ?? "";
    }
    if (!vodId) {
      return NextResponse.json({ error: "vodId required" }, { status: 400 });
    }

    const creds =
      (await loadXtreamPortalCredentials()) ??
      (parsed.data.url ? parseXtreamCredentialsFromStreamUrl(parsed.data.url) : null);
    if (!creds) {
      return NextResponse.json(
        { error: "No Xtream portal configured. Re-import your account in Settings." },
        { status: 422 },
      );
    }

    const info = await fetchXtreamVodInfo(creds, vodId);
    if (!info) {
      log.error("get_vod_info returned nothing", { vodId });
      return NextResponse.json({ error: "Could not load movie from portal." }, { status: 502 });
    }

    const durationSeconds = parseXtreamDurationSeconds(
      info.info as Record<string, unknown> | undefined,
    );

    return NextResponse.json({
      vodId,
      info: info.info ?? {},
      movieData: info.movie_data ?? null,
      durationSeconds: durationSeconds ?? null,
    });
  });
}
