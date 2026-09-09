import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { touchSession } from "@/lib/stream/stream-session-store";
import { authorizeStreamSession } from "@/lib/stream/stream-session-auth";
import { hashStreamUrl } from "@/lib/health/url-hash";
import { findViewingPositionForUrl } from "@/lib/watch/viewing-history-store";
import {
  inferPlaybackModeFromUrl,
  progressivePlaybackExtension,
} from "@/lib/stream/playback-url";

export const runtime = "nodejs";
const log = createServerLogger("api.stream.session.meta");

/** Client-safe playback metadata. Provider URLs and credentials must never be serialized. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const started = Date.now();
  const session = await touchSession(id);
  if (!session) {
    log.warn("Session metadata requested for missing/expired session", { sessionId: id });
    return NextResponse.json({ error: "Unknown or expired session." }, { status: 404 });
  }

  const authorizationFailure = await authorizeStreamSession(request, session, id);
  if (authorizationFailure) return authorizationFailure;

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
  if (mode === "progressive") ext = progressivePlaybackExtension(session.upstreamRootUrl);
  else if (mode === "hls") ext = ".m3u8";
  else if (mode === "mpegts") ext = ".ts";
  const needsBrowserTranscode = mode === "progressive" && ext === ".mkv";
  const historyKey = await hashStreamUrl(session.upstreamRootUrl);
  const resumePositionSeconds =
    !session.accessGrantHash &&
    (session.meta.contentKind === "movie" || session.meta.contentKind === "episode")
      ? await findViewingPositionForUrl(
          session.ownerUserId ?? "__guest__",
          session.upstreamRootUrl,
        )
      : null;

  return NextResponse.json({
    title: session.title,
    logo: session.logo ?? null,
    group: session.group ?? null,
    historyKey,
    resumePositionSeconds,
    playbackUrl: needsBrowserTranscode
      ? `/api/stream/transcode/${id}.m3u8`
      : `/api/stream/proxy/${id}${ext}`,
    playbackMode: needsBrowserTranscode ? "hls" : mode,
    transcoded: needsBrowserTranscode,
    playback: session.meta,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
