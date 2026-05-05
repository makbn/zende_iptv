"use client";

import { useCallback, useEffect, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { hashStreamUrl } from "@/lib/health/url-hash";

export type HealthScoreDto = {
  tier: string;
  successRate: number;
  sampleCount: number;
  updatedAt: string;
};

export function useChannelHealthLookup(channels: M3uChannel[]) {
  const [scoresByHash, setScoresByHash] = useState<
    Record<string, HealthScoreDto>
  >({});

  const refreshScores = useCallback(async () => {
    try {
      const res = await zendeFetch("/api/channel-health/scores", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        scores?: Record<string, HealthScoreDto>;
      };
      if (data.scores) setScoresByHash(data.scores);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void refreshScores();
    });
    return () => cancelAnimationFrame(id);
  }, [refreshScores]);

  const [urlScoreMap, setUrlScoreMap] = useState<
    Map<string, HealthScoreDto | undefined>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = new Map<string, HealthScoreDto | undefined>();
      for (const c of channels) {
        const h = await hashStreamUrl(c.url);
        next.set(c.url, scoresByHash[h]);
      }
      if (!cancelled) setUrlScoreMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [channels, scoresByHash]);

  const getScoreForChannel = useCallback(
    (ch: M3uChannel) => urlScoreMap.get(ch.url),
    [urlScoreMap],
  );

  return { getScoreForChannel, refreshScores };
}
