import "server-only";

import { cleanMediaDisplayTitle } from "@/lib/channel/channel-label";
import { formatEpisodeCode } from "@/lib/playback/play-episode";
import {
  serializePlaybackSessionMeta,
  type PlaybackNeighborRef,
  type PlaybackSessionMeta,
} from "@/lib/playback/stream-session-meta";
import { createStreamSession } from "@/lib/stream/stream-session-store";
import { prisma } from "@/lib/db/prisma";
import type { StoredProxyConfig } from "@/lib/proxies/proxy-store";

/** Drop provider URLs before any playback meta reaches the browser. */
export function clientSafePlaybackMeta(meta: PlaybackSessionMeta): PlaybackSessionMeta {
  const scrub = (ref: PlaybackNeighborRef | undefined): PlaybackNeighborRef | undefined => {
    if (!ref) return undefined;
    const watchId = ref.watchId?.trim();
    if (!watchId) return undefined;
    return {
      season: ref.season,
      episodeNum: ref.episodeNum,
      title: ref.title,
      watchId,
      episodeIndex: ref.episodeIndex,
      ...(ref.durationSeconds ? { durationSeconds: ref.durationSeconds } : {}),
    };
  };
  const previous = scrub(meta.previous);
  const next = scrub(meta.next);
  const { previous: _p, next: _n, ...rest } = meta;
  return {
    ...rest,
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
    hasPrevious: Boolean(previous),
    hasNext: Boolean(next),
  };
}

function neighborNeedsWatchId(ref: PlaybackNeighborRef | undefined): boolean {
  return Boolean(ref?.playUrl?.trim() && !ref.watchId?.trim());
}

async function createNeighborSession(args: {
  ownerUserId?: string;
  proxyConfig?: StoredProxyConfig;
  logo?: string;
  group?: string;
  parent: PlaybackSessionMeta;
  ref: PlaybackNeighborRef;
}): Promise<string | undefined> {
  const playUrl = args.ref.playUrl?.trim();
  if (!playUrl) return args.ref.watchId?.trim();

  const seriesTitle =
    cleanMediaDisplayTitle(args.parent.displayTitle) ||
    cleanMediaDisplayTitle(args.parent.seriesTitle) ||
    "Show";
  const episodeTitle = cleanMediaDisplayTitle(args.ref.title) || args.ref.title || "Episode";
  const code = formatEpisodeCode(args.ref.season, args.ref.episodeNum);
  const displaySubtitle = `${code} · ${episodeTitle}`;

  const neighborMeta: PlaybackSessionMeta = {
    contentKind: "episode",
    displayTitle: seriesTitle,
    displaySubtitle,
    seriesId: args.parent.seriesId,
    seriesTitle,
    season: args.ref.season,
    episodeNum: args.ref.episodeNum,
    episodeTitle,
    episodeIndex: args.ref.episodeIndex,
    searchTitle: seriesTitle,
    year: args.parent.year,
    imdbId: args.parent.imdbId,
    tmdbId: args.parent.tmdbId,
    ...(args.ref.durationSeconds ? { durationSeconds: args.ref.durationSeconds } : {}),
    /* Shallow on purpose — avoid recursive session fan-out. */
    hasPrevious: false,
    hasNext: false,
  };

  return createStreamSession({
    ownerUserId: args.ownerUserId,
    upstreamRootUrl: playUrl,
    title: seriesTitle,
    logo: args.logo,
    group: args.group,
    proxyConfig: args.proxyConfig,
    meta: neighborMeta,
  });
}

/**
 * Create opaque watch sessions for previous/next and attach `watchId`.
 * Provider `playUrl` stays in DB for re-materialize but is stripped from client JSON.
 */
export async function materializeNeighborWatchIds(
  meta: PlaybackSessionMeta,
  opts: {
    ownerUserId?: string;
    proxyConfig?: StoredProxyConfig;
    logo?: string;
    group?: string;
  },
): Promise<PlaybackSessionMeta> {
  if (meta.contentKind !== "episode") return meta;
  if (!neighborNeedsWatchId(meta.previous) && !neighborNeedsWatchId(meta.next)) {
    return meta;
  }

  let previous = meta.previous;
  let next = meta.next;

  if (neighborNeedsWatchId(previous) && previous) {
    const watchId = await createNeighborSession({
      ...opts,
      parent: meta,
      ref: previous,
    }).catch(() => undefined);
    previous = watchId
      ? { ...previous, watchId, playUrl: previous.playUrl }
      : previous;
  }
  if (neighborNeedsWatchId(next) && next) {
    const watchId = await createNeighborSession({
      ...opts,
      parent: meta,
      ref: next,
    }).catch(() => undefined);
    next = watchId ? { ...next, watchId, playUrl: next.playUrl } : next;
  }

  return {
    ...meta,
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
    hasPrevious: Boolean(previous?.watchId || previous?.playUrl),
    hasNext: Boolean(next?.watchId || next?.playUrl),
  };
}

export async function persistSessionPlaybackMeta(
  sessionId: string,
  meta: PlaybackSessionMeta,
): Promise<void> {
  await prisma.streamProxySession.update({
    where: { id: sessionId },
    data: { metaJson: serializePlaybackSessionMeta(meta) },
  });
}
