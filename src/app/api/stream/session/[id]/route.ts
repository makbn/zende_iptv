import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { touchSession } from "@/lib/stream/stream-session-store";
import { inferPlaybackModeFromUrl } from "@/lib/stream/playback-url";

export const runtime = "nodejs";
const log = createServerLogger("api.stream.session.meta");

/** Metadata + canonical upstream URL for stats / ring matching (not shown in address bar). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const started = Date.now();
  const session = await touchSession(id);
  if (!session) {
    log.warn("Session metadata requested for missing/expired session", { sessionId: id });
    return NextResponse.json({ error: "Unknown or expired session." }, { status: 404 });
  }

  log.info("Session metadata served", {
    sessionId: id,
    upstreamHost: (() => {
      try {
        return new URL(session.upstreamRootUrl).host;
      } catch {
        return "(invalid-upstream-url)";
      }
    })(),
    aliasCount: session.urlAliases.size,
    cookieOrigins: Object.keys(session.cookieJar ?? {}).length,
    hasProxy: Boolean(session.proxyConfig),
    elapsedMs: Date.now() - started,
  });

  const mode = inferPlaybackModeFromUrl(session.upstreamRootUrl);
  let ext = "";
  if (mode === "progressive") ext = ".mp4";
  else if (mode === "hls") ext = ".m3u8";
  else if (mode === "mpegts") ext = ".ts";

  return NextResponse.json({
    title: session.title,
    logo: session.logo ?? null,
    group: session.group ?? null,
    playbackUrl: `/api/stream/proxy/${id}${ext}`,
    canonicalUrl: session.upstreamRootUrl,
    playbackMode: mode,
    playback: session.meta,
  });
}
