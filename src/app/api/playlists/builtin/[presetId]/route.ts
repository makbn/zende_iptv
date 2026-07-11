import { NextResponse } from "next/server";

import { getBuiltinPlaylistSource } from "@/config/builtin-playlist-sources";
import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";

export const runtime = "nodejs";

/**
 * Secure proxy for allowlisted builtin playlists only (no arbitrary URLs).
 * Streams the upstream M3U body to avoid buffering huge catalogs in memory.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ presetId: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const { presetId } = await context.params;
  const log = createServerLogger("api.playlists.builtin");

  const source = getBuiltinPlaylistSource(presetId);
  if (!source) {
    log.warn("Reject unknown builtin preset", { presetId });
    return NextResponse.json({ error: "Unknown preset" }, { status: 404 });
  }

  log.info("Proxying builtin playlist", {
    presetId,
    upstream: source.m3uUrl,
  });

  try {
    const upstream = await fetch(source.m3uUrl, {
      headers: {
        "User-Agent": "Zende/0.1 (built-in playlist setup; +https://github.com)",
        Accept: "audio/x-mpegurl, application/vnd.apple.mpegurl, */*",
      },
      next: { revalidate: 3600 },
    });

    if (!upstream.ok || !upstream.body) {
      log.warn("Upstream playlist fetch failed", {
        status: upstream.status,
        presetId,
      });
      return NextResponse.json(
        { error: "Upstream playlist unavailable" },
        { status: 502 },
      );
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/x-mpegurl",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Zende-Preset": presetId,
      },
    });
  } catch (err) {
    log.error("Builtin playlist proxy failed", {
      presetId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
