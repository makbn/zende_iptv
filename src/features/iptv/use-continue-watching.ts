"use client";

import { useEffect, useMemo, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import {
  getPlaybackPosition,
  playbackProgressRatio,
} from "@/lib/playback/playback-position";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import {
  listRecentPlayback,
  subscribeViewingStats,
  viewingEntryToChannel,
} from "@/lib/watch/viewing-stats";

export type ContinueWatchingItem = {
  channel: M3uChannel;
  playback?: PlaybackSessionMeta;
  progress: number;
  positionSeconds: number;
};

export function useContinueWatchingItems(limit = 18): ContinueWatchingItem[] {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => subscribeViewingStats(() => setEpoch((n) => n + 1)), []);

  return useMemo(() => {
    void epoch;
    const items: ContinueWatchingItem[] = [];
    for (const entry of listRecentPlayback(80)) {
      const position = entry.positionSeconds ?? getPlaybackPosition(entry.url);
      if (position == null || position < 30) continue;
      const progress =
        playbackProgressRatio(position, entry.playback?.durationSeconds) ??
        Math.min(0.88, Math.max(0.08, position / 7200));
      items.push({
        channel: viewingEntryToChannel(entry, []),
        ...(entry.playback ? { playback: entry.playback } : {}),
        progress,
        positionSeconds: position,
      });
      if (items.length >= limit) break;
    }
    return items;
  }, [epoch, limit]);
}
