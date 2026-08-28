"use client";

import { useCallback, useEffect, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import type { MediaMetadata } from "@/lib/media/media-metadata";

export type MovieInfoResponse = {
  vodId: string;
  info: Record<string, unknown>;
  movieData: Record<string, unknown> | null;
  durationSeconds: number | null;
  metadata: MediaMetadata | null;
  channel: M3uChannel;
  error?: string;
};

export function useMovieInfo(movieId: string, fallbackTitle?: string) {
  const [data, setData] = useState<MovieInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ vodId: movieId });
      if (fallbackTitle?.trim()) params.set("title", fallbackTitle.trim());
      const response = await zendeFetch(`/api/xtream/vod-info?${params.toString()}`);
      const body = (await response.json().catch(() => ({}))) as MovieInfoResponse;
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setData(body);
    } catch (reason) {
      setData(null);
      setError(reason instanceof Error ? reason.message : "Could not load movie");
    } finally {
      setLoading(false);
    }
  }, [fallbackTitle, movieId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  return { data, loading, error, reload };
}
