"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { hashStreamUrl } from "@/lib/health/url-hash";

export type HealthScoreDto = {
  tier: string;
  successRate: number;
  sampleCount: number;
  updatedAt: string;
};

const SCORE_TTL_MS = 60_000;
const MAX_HEALTH_CHANNELS = 80;
const hashCache = new Map<string, string>();
const scoreCache = new Map<string, { score?: HealthScoreDto; at: number }>();

async function cachedHash(url: string): Promise<string> {
  const hit = hashCache.get(url);
  if (hit) return hit;
  const h = await hashStreamUrl(url);
  hashCache.set(url, h);
  return h;
}

export function useChannelHealthLookup(channels: M3uChannel[]) {
  const [urlScoreMap, setUrlScoreMap] = useState<
    Map<string, HealthScoreDto | undefined>
  >(new Map());
  const channelsKey = useRef("");

  const channelsSlice = channels.slice(0, MAX_HEALTH_CHANNELS);

  const refreshScores = useCallback(async () => {
    if (channelsSlice.length === 0) {
      setUrlScoreMap(new Map());
      return;
    }
    try {
      const hashes = await Promise.all(
        channelsSlice.map((c) => cachedHash(c.url)),
      );
      const needFetch: string[] = [];
      const next = new Map<string, HealthScoreDto | undefined>();
      const now = Date.now();

      for (let i = 0; i < channelsSlice.length; i++) {
        const ch = channelsSlice[i]!;
        const hash = hashes[i]!;
        const cached = scoreCache.get(hash);
        if (cached && now - cached.at < SCORE_TTL_MS) {
          next.set(ch.url, cached.score);
        } else {
          needFetch.push(hash);
        }
      }

      if (needFetch.length > 0) {
        const unique = [...new Set(needFetch)];
        const res = await zendeFetch(
          `/api/channel-health/scores?hashes=${encodeURIComponent(unique.join(","))}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            scores?: Record<string, HealthScoreDto>;
          };
          const scoresByHash = data.scores ?? {};
          for (const hash of unique) {
            scoreCache.set(hash, { score: scoresByHash[hash], at: now });
          }
        }
      }

      for (let i = 0; i < channelsSlice.length; i++) {
        const ch = channelsSlice[i]!;
        const hash = hashes[i]!;
        next.set(ch.url, scoreCache.get(hash)?.score);
      }
      setUrlScoreMap(next);
    } catch {
      /* ignore */
    }
  }, [channelsSlice]);

  useEffect(() => {
    const key = channelsSlice.map((c) => c.url).join("\0");
    if (key === channelsKey.current) return;
    channelsKey.current = key;
    const id = requestAnimationFrame(() => {
      void refreshScores();
    });
    return () => cancelAnimationFrame(id);
  }, [channelsSlice, refreshScores]);

  const getScoreForChannel = useCallback(
    (ch: M3uChannel) => urlScoreMap.get(ch.url),
    [urlScoreMap],
  );

  return { getScoreForChannel, refreshScores };
}
