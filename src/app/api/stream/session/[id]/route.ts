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
import { cleanMediaDisplayTitle } from "@/lib/channel/channel-label";
import {
  clientSafePlaybackMeta,
  materializeNeighborWatchIds,
  persistSessionPlaybackMeta,
} from "@/lib/playback/neighbor-watch-sessions";
import { attachIntroToPlaybackMeta } from "@/lib/playback/resolve-duration";

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

  let meta = session.meta;
  let metaDirty = false;

  const needsMaterialize =
    meta.contentKind === "episode" &&
    ((Boolean(meta.previous?.playUrl) && !meta.previous?.watchId) ||
      (Boolean(meta.next?.playUrl) && !meta.next?.watchId));
  if (needsMaterialize) {
    meta = await materializeNeighborWatchIds(meta, {
      ownerUserId: session.ownerUserId ?? undefined,
      proxyConfig: session.proxyConfig ?? undefined,
      logo: session.logo,
      group: session.group,
    });
    metaDirty = true;
  }

  if (meta.intro === undefined && meta.contentKind !== "live") {
    const withIntro = await attachIntroToPlaybackMeta(meta);
    if (withIntro.intro !== undefined) {
      meta = withIntro;
      metaDirty = true;
    }
  }

  if (metaDirty) {
    await persistSessionPlaybackMeta(id, meta).catch(() => undefined);
    session.meta = meta;
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
    introSegments: meta.intro?.length ?? null,
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
    (meta.contentKind === "movie" || meta.contentKind === "episode")
      ? await findViewingPositionForUrl(
          session.ownerUserId ?? "__guest__",
          session.upstreamRootUrl,
        )
      : null;

  const safeMeta = clientSafePlaybackMeta(meta);
  const title =
    safeMeta.displayTitle?.trim() ||
    cleanMediaDisplayTitle(session.title) ||
    session.title;

  return NextResponse.json(
    {
      title,
      logo: session.logo ?? null,
      group: session.group ?? null,
      historyKey,
      resumePositionSeconds,
      playbackUrl: needsBrowserTranscode
        ? `/api/stream/transcode/${id}.m3u8`
        : `/api/stream/proxy/${id}${ext}`,
      playbackMode: needsBrowserTranscode ? "hls" : mode,
      transcoded: needsBrowserTranscode,
      playback: safeMeta,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
