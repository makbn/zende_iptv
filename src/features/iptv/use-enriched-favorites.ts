"use client";

import { useEffect, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import {
  fetchEnrichedFavoritesFromApi,
  subscribeFavorites,
} from "@/lib/favorites/favorites-store";
import { subscribeParentalAccessChanged } from "@/lib/parental/parental-events";

/** Loads favorites enriched from the server catalog (no full client catalog download). */
export function useEnrichedFavorites(options?: { serverOnly?: boolean }): M3uChannel[] {
  return useEnrichedFavoritesState(options).channels;
}

/** Distinguishes an uninitialized request from a completed empty favorites list. */
export function useEnrichedFavoritesState(options?: { serverOnly?: boolean }): {
  channels: M3uChannel[];
  loading: boolean;
} {
  const serverOnly = options?.serverOnly === true;
  const [epoch, setEpoch] = useState(0);
  const [channels, setChannels] = useState<M3uChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeFavorites(() => setEpoch((n) => n + 1)), []);
  useEffect(
    () => subscribeParentalAccessChanged(() => setEpoch((n) => n + 1)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchEnrichedFavoritesFromApi({
        fallbackToLocal: !serverOnly,
      });
      if (!cancelled) {
        setChannels(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [epoch, serverOnly]);

  return { channels, loading };
}
