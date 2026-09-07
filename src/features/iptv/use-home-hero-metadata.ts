"use client";

import { useEffect, useMemo, useState } from "react";

import { zendeFetch } from "@/lib/auth/zende-fetch";
import type { MediaMetadata } from "@/lib/media/media-metadata";

export type HomeHeroMetadataQuery = {
  title: string;
  mediaType: "movie" | "tv";
  channelId?: string;
  seriesId?: string;
  imdbId?: string;
  year?: string;
};

const clientCache = new Map<string, MediaMetadata | null>();

export function useHomeHeroMetadata(query: HomeHeroMetadataQuery | null): MediaMetadata | null {
  const key = useMemo(() => {
    if (!query) return null;
    const params = new URLSearchParams({ title: query.title, mediaType: query.mediaType });
    if (query.channelId) params.set("channelId", query.channelId);
    if (query.seriesId) params.set("seriesId", query.seriesId);
    if (query.imdbId) params.set("imdbId", query.imdbId);
    if (query.year) params.set("year", query.year);
    return params.toString();
  }, [query]);
  const [resolved, setResolved] = useState<{
    key: string;
    metadata: MediaMetadata | null;
  } | null>(null);
  const metadata = !key
    ? null
    : clientCache.has(key)
      ? clientCache.get(key) ?? null
      : resolved?.key === key
        ? resolved.metadata
        : null;

  useEffect(() => {
    if (!key || clientCache.has(key)) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void zendeFetch(`/api/library/hero-metadata?${key}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const body = (await response.json()) as { metadata?: MediaMetadata | null };
          const next = body.metadata ?? null;
          clientCache.set(key, next);
          setResolved({ key, metadata: next });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          clientCache.set(key, null);
          setResolved({ key, metadata: null });
        });
    }, 140);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return metadata;
}
