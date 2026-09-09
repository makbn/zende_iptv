import { zendeFetch } from "@/lib/auth/zende-fetch";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import {
  recordLocalPlaybackProgress,
  updateViewingPosition,
} from "@/lib/watch/viewing-stats";

export type PlaybackPositionSyncTarget = {
  sessionId?: string | null;
  url?: string | null;
  name?: string;
  tvgLogo?: string;
  groupTitle?: string;
  playback?: PlaybackSessionMeta;
};

/** Best-effort resume sync stub — server may ignore until API is fully implemented. */
export async function syncPlaybackPositionStub(
  target: PlaybackPositionSyncTarget,
  positionSeconds: number,
  options?: { keepalive?: boolean },
): Promise<void> {
  if (
    (!target.url && !target.sessionId) ||
    !Number.isFinite(positionSeconds) ||
    positionSeconds < 5
  ) return;
  if (target.url) {
    updateViewingPosition(target.url, positionSeconds);
    if (target.name) {
      recordLocalPlaybackProgress({
        url: target.url,
        name: target.name,
        ...(target.tvgLogo ? { tvgLogo: target.tvgLogo } : {}),
        ...(target.groupTitle ? { groupTitle: target.groupTitle } : {}),
        ...(target.playback ? { playback: target.playback } : {}),
        positionSeconds,
      });
    }
  }
  try {
    await zendeFetch("/api/user/playback-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(target.sessionId ? { sessionId: target.sessionId } : {}),
        ...(target.url ? { url: target.url } : {}),
        ...(target.name ? { name: target.name } : {}),
        ...(target.tvgLogo ? { tvgLogo: target.tvgLogo } : {}),
        ...(target.groupTitle ? { groupTitle: target.groupTitle } : {}),
        ...(target.playback ? { playback: target.playback } : {}),
        positionSeconds: Math.round(positionSeconds),
      }),
      keepalive: options?.keepalive,
    });
  } catch {
    /* optional stub */
  }
}
