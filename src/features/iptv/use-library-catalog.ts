"use client";

import { useEffect, useRef, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { subscribeCatalogCleared } from "@/lib/channels/catalog-events";

export type LibraryContentTab = "all" | "live" | "movie" | "series";

type LibraryFacets = {
  groups: Array<{ name: string; count: number }>;
  languages: Array<{ key: string; label: string; count: number }>;
};

export function useLibraryCatalog(input: {
  presetId: string;
  contentTab: LibraryContentTab;
  query: string;
  groupFilter: string | null;
  languageFilter: string | null;
  offset: number;
  pageSize: number;
}) {
  const { ready: authReady } = useAuth();
  const [channels, setChannels] = useState<M3uChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<LibraryFacets>({ groups: [], languages: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const hasLoadedOnce = useRef(false);
  const requestSeq = useRef(0);
  const filterKey = `${input.presetId}|${input.contentTab}|${input.query}|${input.groupFilter}|${input.languageFilter}`;
  const lastFilterKey = useRef(filterKey);

  useEffect(() => subscribeCatalogCleared(() => setReloadNonce((n) => n + 1)), []);

  useEffect(() => {
    if (!authReady) return;
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    const filtersChanged = lastFilterKey.current !== filterKey;
    if (filtersChanged) {
      lastFilterKey.current = filterKey;
    }
    const isAppend = input.offset > 0 && !filtersChanged;

    if (hasLoadedOnce.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    void (async () => {
      try {
        const params = new URLSearchParams({
          presetId: input.presetId,
          contentType: input.contentTab,
          offset: String(input.offset),
          limit: String(input.pageSize),
        });
        const q = input.query.trim();
        if (q) params.set("q", q);
        if (input.groupFilter) params.set("group", input.groupFilter);
        if (input.languageFilter) params.set("language", input.languageFilter);

        const res = await zendeFetch(`/api/library/catalog?${params.toString()}`, {
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => ({}))) as {
          channels?: M3uChannel[];
          total?: number;
          facets?: LibraryFacets;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        if (controller.signal.aborted || seq !== requestSeq.current) return;

        const page = Array.isArray(body.channels) ? body.channels : [];
        setChannels((prev) => (isAppend ? [...prev, ...page] : page));
        setTotal(typeof body.total === "number" ? body.total : 0);
        if (!isAppend) {
          setFacets(
            body.facets ?? {
              groups: [],
              languages: [],
            },
          );
        }
        hasLoadedOnce.current = true;
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeq.current) return;
        if (!isAppend) {
          setChannels([]);
          setTotal(0);
          setFacets({ groups: [], languages: [] });
        }
        setError(err instanceof Error ? err.message : "Failed to load library");
      } finally {
        if (controller.signal.aborted || seq !== requestSeq.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    authReady,
    filterKey,
    input.offset,
    input.pageSize,
    input.presetId,
    reloadNonce,
  ]);

  return {
    channels,
    total,
    facets,
    loading,
    refreshing,
    error,
    hasMore: total > channels.length,
  };
}
