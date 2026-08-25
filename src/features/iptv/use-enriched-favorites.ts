"use client";

import { useEffect, useRef, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import {
  fetchEnrichedFavoritesFromApi,
  subscribeFavorites,
} from "@/lib/favorites/favorites-store";
import { subscribeParentalAccessChanged } from "@/lib/parental/parental-events";

/** Loads favorites enriched from the server catalog (no full client catalog download). */
export function useEnrichedFavorites(options?: { serverOnly?: boolean }): M3uChannel[] {
  const serverOnly = options?.serverOnly === true;
  const [epoch, setEpoch] = useState(0);
  const [channels, setChannels] = useState<M3uChannel[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeFavorites(() => setEpoch((n) => n + 1)), []);
  useEffect(
    () => subscribeParentalAccessChanged(() => setEpoch((n) => n + 1)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const rows = await fetchEnrichedFavoritesFromApi({
          fallbackToLocal: !serverOnly,
        });
        if (!cancelled) setChannels(rows);
      })();
    }, 280);
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [epoch, serverOnly]);

  return channels;
}
