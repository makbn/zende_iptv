"use client";

import { useEffect, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
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
  limit: number;
}) {
  const [channels, setChannels] = useState<M3uChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<LibraryFacets>({ groups: [], languages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => subscribeCatalogCleared(() => setReloadNonce((n) => n + 1)), []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const params = new URLSearchParams({
            presetId: input.presetId,
            contentType: input.contentTab,
            offset: "0",
            limit: String(input.limit),
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
          setChannels(Array.isArray(body.channels) ? body.channels : []);
          setTotal(typeof body.total === "number" ? body.total : 0);
          setFacets(
            body.facets ?? {
              groups: [],
              languages: [],
            },
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          setChannels([]);
          setTotal(0);
          setFacets({ groups: [], languages: [] });
          setError(err instanceof Error ? err.message : "Failed to load library");
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    input.presetId,
    input.contentTab,
    input.query,
    input.groupFilter,
    input.languageFilter,
    input.limit,
    reloadNonce,
  ]);

  return {
    channels,
    total,
    facets,
    loading,
    error,
    hasMore: total > channels.length,
  };
}
