"use client";

import { useEffect, useRef, useState } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { subscribeCatalogCleared } from "@/lib/channels/catalog-events";
import { subscribeParentalAccessChanged } from "@/lib/parental/parental-events";

export type LibraryContentTab = "all" | "live" | "movie" | "series";

type LibraryFacets = {
  groups: Array<{ name: string; count: number }>;
  categories: Array<{ key: string; label: string; count: number }>;
  languages: Array<{ key: string; label: string; count: number }>;
  countries: Array<{ key: string; label: string; count: number }>;
  years: Array<{ key: string; label: string; count: number }>;
  ratings: Array<{ min: number; count: number }>;
};

type CachedResult = {
  channels: M3uChannel[];
  total: number;
  facets: LibraryFacets;
  cachedAt: number;
};

const LIBRARY_CACHE_TTL_MS = 120_000;
const libraryResultCache = new Map<string, CachedResult>();
const libraryInflight = new Map<string, Promise<CachedResult>>();

async function fetchLibraryCatalogPage(
  requestKey: string,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<CachedResult> {
  const inflight = libraryInflight.get(requestKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const res = await zendeFetch(`/api/library/catalog?${params.toString()}`, {
      signal,
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
    return {
      channels: Array.isArray(body.channels) ? body.channels : [],
      total: typeof body.total === "number" ? body.total : 0,
      facets: body.facets
        ? {
            ...body.facets,
            groups: body.facets.groups ?? [],
            categories: body.facets.categories ?? [],
            languages: body.facets.languages ?? [],
            countries: body.facets.countries ?? [],
            years: body.facets.years ?? [],
            ratings: body.facets.ratings ?? [],
          }
        : {
            groups: [],
            categories: [],
            languages: [],
            countries: [],
            years: [],
            ratings: [],
          },
      cachedAt: Date.now(),
    };
  })().finally(() => {
    libraryInflight.delete(requestKey);
  });

  libraryInflight.set(requestKey, promise);
  return promise;
}

export function useLibraryCatalog(input: {
  contentTab: LibraryContentTab;
  query: string;
  groupFilter: string | null;
  categoryFilter?: string | null;
  languageFilter: string | null;
  countryFilter?: string | null;
  yearFilter?: string | null;
  minImdbRating?: number | null;
  offset: number;
  pageSize: number;
}) {
  const { protectedApiReady } = useAuth();
  const [channels, setChannels] = useState<M3uChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<LibraryFacets>({
    groups: [],
    categories: [],
    languages: [],
    countries: [],
    years: [],
    ratings: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const hasLoadedOnce = useRef(false);
  const requestSeq = useRef(0);
  const channelsRef = useRef<M3uChannel[]>([]);
  const facetsRef = useRef<LibraryFacets>({
    groups: [],
    categories: [],
    languages: [],
    countries: [],
    years: [],
    ratings: [],
  });
  const filterKey = `${input.contentTab}|${input.query}|${input.groupFilter}|${input.categoryFilter ?? null}|${input.languageFilter}|${input.countryFilter ?? null}|${input.yearFilter ?? null}|${input.minImdbRating ?? null}`;
  const pageKey = `${filterKey}|${input.offset}|${input.pageSize}`;
  const lastFilterKey = useRef(filterKey);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    facetsRef.current = facets;
  }, [facets]);

  useEffect(
    () =>
      subscribeCatalogCleared(() => {
        libraryResultCache.clear();
        libraryInflight.clear();
        setReloadNonce((n) => n + 1);
      }),
    [],
  );

  useEffect(
    () =>
      subscribeParentalAccessChanged(() => {
        libraryResultCache.clear();
        libraryInflight.clear();
        setReloadNonce((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    if (!protectedApiReady) return;
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    const filtersChanged = lastFilterKey.current !== filterKey;
    if (filtersChanged) {
      lastFilterKey.current = filterKey;
    }
    const isAppend = input.offset > 0 && !filtersChanged;
    const appendFromFreshMount = isAppend && channelsRef.current.length === 0;

    const cached = libraryResultCache.get(pageKey);
    const cacheFresh =
      cached && Date.now() - cached.cachedAt < LIBRARY_CACHE_TTL_MS;
    if (cacheFresh) {
      hasLoadedOnce.current = true;
      queueMicrotask(() => {
        if (controller.signal.aborted || seq !== requestSeq.current) return;
        setChannels(cached.channels);
        setTotal(cached.total);
        setFacets(cached.facets);
        setLoading(false);
        setRefreshing(false);
      });
      return () => controller.abort();
    }

    queueMicrotask(() => {
      if (controller.signal.aborted || seq !== requestSeq.current) return;
      if (hasLoadedOnce.current && !appendFromFreshMount) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
    });

    void (async () => {
      try {
        const effectiveOffset = appendFromFreshMount ? 0 : input.offset;
        const effectiveLimit = appendFromFreshMount
          ? input.offset + input.pageSize
          : input.pageSize;

        const params = new URLSearchParams({
          contentType: input.contentTab,
          offset: String(effectiveOffset),
          limit: String(effectiveLimit),
        });
        const q = input.query.trim();
        if (q) params.set("q", q);
        if (input.groupFilter) params.set("group", input.groupFilter);
        if (input.categoryFilter) params.set("category", input.categoryFilter);
        if (input.languageFilter) params.set("language", input.languageFilter);
        if (input.countryFilter) params.set("country", input.countryFilter);
        if (input.yearFilter) params.set("year", input.yearFilter);
        if (input.minImdbRating) params.set("minImdbRating", String(input.minImdbRating));

        const requestKey = params.toString();
        const fetched = await fetchLibraryCatalogPage(
          requestKey,
          params,
          controller.signal,
        );
        if (controller.signal.aborted || seq !== requestSeq.current) return;

        const page = fetched.channels;
        const nextTotal = fetched.total;
        const nextFacets = fetched.facets;
        const nextChannels =
          isAppend && !appendFromFreshMount
            ? [...channelsRef.current, ...page]
            : page;

        setChannels(nextChannels);
        setTotal(nextTotal);
        if (!isAppend || appendFromFreshMount) {
          setFacets(nextFacets);
        }

        libraryResultCache.set(pageKey, {
          channels: nextChannels,
          total: nextTotal,
          facets:
            !isAppend || appendFromFreshMount ? nextFacets : facetsRef.current,
          cachedAt: Date.now(),
        });
        hasLoadedOnce.current = true;
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeq.current) return;
        if (!isAppend) {
          setChannels([]);
          setTotal(0);
          setFacets({ groups: [], categories: [], languages: [], countries: [], years: [], ratings: [] });
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
    protectedApiReady,
    filterKey,
    input.offset,
    input.pageSize,
    input.contentTab,
    input.groupFilter,
    input.categoryFilter,
    input.languageFilter,
    input.countryFilter,
    input.yearFilter,
    input.minImdbRating,
    input.query,
    pageKey,
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
