"use client";

import { useEffect, useRef, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { subscribeCatalogCleared } from "@/lib/channels/catalog-events";

export type HomeCatalogShelves = {
  discover: { channels: M3uChannel[]; total: number };
  movies: { channels: M3uChannel[]; total: number };
  series: { channels: M3uChannel[]; total: number };
};

const SHELVES_CACHE_TTL_MS = 60_000;
let shelvesCache: { key: string; data: HomeCatalogShelves; cachedAt: number } | null =
  null;
let shelvesInflight: Promise<HomeCatalogShelves> | null = null;
let shelvesInflightKey: string | null = null;

async function fetchHomeShelves(input: {
  presetId: string;
  language: string | null;
  discoverLimit: number;
  movieLimit: number;
  seriesLimit: number;
}): Promise<HomeCatalogShelves> {
  const key = `${input.presetId}|${input.language ?? ""}|${input.discoverLimit}|${input.movieLimit}|${input.seriesLimit}`;
  const now = Date.now();
  if (shelvesCache && shelvesCache.key === key && now - shelvesCache.cachedAt < SHELVES_CACHE_TTL_MS) {
    return shelvesCache.data;
  }

  if (!shelvesInflight || shelvesInflightKey !== key) {
    shelvesInflightKey = key;
    const params = new URLSearchParams({
      presetId: input.presetId,
      discoverLimit: String(input.discoverLimit),
      movieLimit: String(input.movieLimit),
      seriesLimit: String(input.seriesLimit),
    });
    if (input.language) params.set("language", input.language);

    shelvesInflight = zendeFetch(`/api/library/home-shelves?${params.toString()}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as HomeCatalogShelves & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        shelvesCache = { key, data: body, cachedAt: Date.now() };
        return body;
      })
      .finally(() => {
        shelvesInflight = null;
        shelvesInflightKey = null;
      });
  }

  return shelvesInflight;
}

export function useHomeCatalogShelves(input: {
  presetId: string;
  language?: string | null;
  discoverLimit?: number;
  movieLimit?: number;
  seriesLimit?: number;
}) {
  const { protectedApiReady } = useAuth();
  const [data, setData] = useState<HomeCatalogShelves>({
    discover: { channels: [], total: 0 },
    movies: { channels: [], total: 0 },
    series: { channels: [], total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const requestSeq = useRef(0);

  const discoverLimit = input.discoverLimit ?? 36;
  const movieLimit = input.movieLimit ?? 18;
  const seriesLimit = input.seriesLimit ?? 18;
  const language = input.language ?? null;

  useEffect(
    () =>
      subscribeCatalogCleared(() => {
        shelvesCache = null;
        setReloadNonce((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    if (!protectedApiReady) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const shelves = await fetchHomeShelves({
          presetId: input.presetId,
          language,
          discoverLimit,
          movieLimit,
          seriesLimit,
        });
        if (seq !== requestSeq.current) return;
        setData(shelves);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setData({
          discover: { channels: [], total: 0 },
          movies: { channels: [], total: 0 },
          series: { channels: [], total: 0 },
        });
        setError(err instanceof Error ? err.message : "Failed to load home shelves");
      } finally {
        if (seq !== requestSeq.current) return;
        setLoading(false);
      }
    })();
  }, [
    protectedApiReady,
    input.presetId,
    language,
    discoverLimit,
    movieLimit,
    seriesLimit,
    reloadNonce,
  ]);

  return { ...data, loading, error };
}
