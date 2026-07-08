"use client";

import { useEffect, useState } from "react";

import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";

const DEFAULT_PRESET = BUILTIN_PLAYLIST_SOURCES[0]!.presetId;

/** Server-side channel search for recordings picker (no full catalog download). */
export function useChannelSearch(query: string, limit = 24) {
  const [channels, setChannels] = useState<M3uChannel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    const delay = q ? 220 : 0;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams({
            presetId: DEFAULT_PRESET,
            contentType: "live",
            offset: "0",
            limit: String(limit),
          });
          if (q) params.set("q", q);
          const res = await zendeFetch(`/api/library/catalog?${params.toString()}`);
          if (!res.ok || cancelled) return;
          const data = (await res.json()) as { channels?: M3uChannel[] };
          if (!cancelled) setChannels(data.channels ?? []);
        } catch {
          if (!cancelled) setChannels([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, limit]);

  return { channels, loading };
}
