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
  const [urlScoreMap, setUrlScoreMap] = useState<
    Map<string, HealthScoreDto | undefined>
  >(new Map());

  const refreshScores = useCallback(async () => {
    if (channels.length === 0) {
      setUrlScoreMap(new Map());
      return;
    }
    try {
      const hashes = await Promise.all(channels.map((c) => hashStreamUrl(c.url)));
      const unique = [...new Set(hashes)];
      const res = await zendeFetch(
        `/api/channel-health/scores?hashes=${encodeURIComponent(unique.join(","))}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        scores?: Record<string, HealthScoreDto>;
      };
      const scoresByHash = data.scores ?? {};
      const next = new Map<string, HealthScoreDto | undefined>();
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i]!;
        next.set(ch.url, scoresByHash[hashes[i]!]);
      }
      setUrlScoreMap(next);
    } catch {
      /* ignore */
    }
  }, [channels]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void refreshScores();
    });
    return () => cancelAnimationFrame(id);
  }, [refreshScores]);

  const getScoreForChannel = useCallback(
    (ch: M3uChannel) => urlScoreMap.get(ch.url),
    [urlScoreMap],
  );

  return { getScoreForChannel, refreshScores };
}
