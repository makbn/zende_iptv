"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { zendeFetch } from "@/lib/auth/zende-fetch";
import type { SeriesEpisodeRow } from "@/app/api/xtream/series-info/route";

export type SeriesInfoResponse = {
  seriesId: string;
  info: Record<string, unknown>;
  seasons: Array<{ season_number?: number | string; name?: string }>;
  episodes: SeriesEpisodeRow[];
  error?: string;
};

export function useSeriesInfo(seriesId: string | null) {
  const [data, setData] = useState<SeriesInfoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!seriesId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ seriesId });
      const res = await zendeFetch(`/api/xtream/series-info?${params.toString()}`);
      const body = (await res.json().catch(() => ({}))) as SeriesInfoResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Could not load show");
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const episodesBySeason = useMemo(() => {
    const episodes = data?.episodes ?? [];
    const map = new Map<string, Array<SeriesEpisodeRow & { index: number }>>();
    episodes.forEach((ep, index) => {
      const key = ep.season || "0";
      const list = map.get(key) ?? [];
      list.push({ ...ep, index });
      map.set(key, list);
    });
    const seasons = [...map.keys()].sort((a, b) => {
      const na = Number.parseInt(a, 10) || 0;
      const nb = Number.parseInt(b, 10) || 0;
      return na - nb;
    });
    return { seasons, map, flat: episodes };
  }, [data?.episodes]);

  const showTitle = useMemo(() => {
    const fromInfo = data?.info?.name;
    if (typeof fromInfo === "string" && fromInfo.trim()) return fromInfo.trim();
    return null;
  }, [data?.info]);

  const showPlot = useMemo(() => {
    const plot = data?.info?.plot ?? data?.info?.description;
    return typeof plot === "string" ? plot.trim() : "";
  }, [data?.info]);

  const showCover = useMemo(() => {
    const cover = data?.info?.cover ?? data?.info?.movie_image;
    return typeof cover === "string" ? cover.trim() : "";
  }, [data?.info]);

  const showBackdrop = useMemo(() => {
    const info = data?.info;
    if (!info || typeof info !== "object") return "";
    const src = info as Record<string, unknown>;
    const candidates = [
      src.cover_big,
      src.backdrop_path,
      src.backdrop,
      src.backdrop_url,
      src.movie_image,
      src.cover,
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value)) {
        const first = value.find((v) => typeof v === "string" && v.trim());
        if (typeof first === "string") return first.trim();
      }
    }
    return "";
  }, [data?.info]);

  return {
    data,
    loading,
    error,
    reload,
    episodesBySeason,
    showTitle,
    showPlot,
    showCover,
    showBackdrop,
  };
}
