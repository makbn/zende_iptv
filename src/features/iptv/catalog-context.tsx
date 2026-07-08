"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { BuiltinPlaylistSource } from "@/config/builtin-playlist-sources";
import { useAuth } from "@/features/auth/auth-context";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { mergeBuiltinAndManual } from "@/lib/channels/merge-catalog";
import {
  hydrateManualChannelsFromApiOnce,
  getManualChannelCount,
  listManualChannelEntries,
  subscribeManualChannels,
} from "@/lib/channels/manual-channels-store";
import {
  fetchPlaylistCatalogFromApi,
  fetchPlaylistCatalogMetaFromApi,
  refreshPlaylistCatalogOnServer,
} from "@/lib/playlists/server-catalog-api";
import { syncChannelRegistry } from "@/features/health/registry-sync";
import { subscribeCatalogCleared } from "@/lib/channels/catalog-events";

const log = createClientLogger("features.iptv.catalogContext");

type CatalogContextValue = {
  busy: boolean;
  error: string | null;
  channelCount: number | null;
  builtinChannelCount: number;
  manualChannelCount: number;
  channels: M3uChannel[];
  catalogLoaded: boolean;
  channelsHydrated: boolean;
  metaFailed: boolean;
  registered: boolean;
  refreshCatalog: () => Promise<void>;
  reloadFromCache: () => Promise<void>;
  ensureFullCatalog: () => Promise<M3uChannel[]>;
  clearError: () => void;
};

const CatalogMetaCtx = createContext<Omit<CatalogContextValue, "channels"> | null>(
  null,
);
const CatalogChannelsCtx = createContext<M3uChannel[]>([]);

export function CatalogProvider({
  source,
  children,
}: {
  source: BuiltinPlaylistSource;
  children: ReactNode;
}) {
  const { ready: authReady } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseChannels, setBaseChannels] = useState<M3uChannel[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [channelsHydrated, setChannelsHydrated] = useState(false);
  const [manualEpoch, setManualEpoch] = useState(0);
  const [serverChannelCount, setServerChannelCount] = useState<number | null>(
    null,
  );
  const [metaFailed, setMetaFailed] = useState(false);
  const fullHydratePromise = useRef<Promise<M3uChannel[]> | null>(null);
  const registrySynced = useRef(false);

  useEffect(() => subscribeManualChannels(() => setManualEpoch((n) => n + 1)), []);

  useEffect(
    () =>
      subscribeCatalogCleared(() => {
        setBaseChannels([]);
        setServerChannelCount(0);
        setChannelsHydrated(true);
        setCatalogLoaded(true);
        fullHydratePromise.current = null;
        registrySynced.current = false;
      }),
    [],
  );

  useEffect(() => {
    void hydrateManualChannelsFromApiOnce();
  }, []);

  const channels = useMemo(() => {
    const manual =
      getManualChannelCount() <= 500
        ? listManualChannelEntries().map((e) => e.channel)
        : [];
    return mergeBuiltinAndManual(baseChannels, manual);
  }, [baseChannels, manualEpoch]);

  const channelCount =
    serverChannelCount != null
      ? serverChannelCount
      : catalogLoaded
        ? baseChannels.length + getManualChannelCount()
        : null;

  const loadMeta = useCallback(async () => {
    const meta = await fetchPlaylistCatalogMetaFromApi(source.presetId);
    setMetaFailed(!meta.ok);
    if (meta.ok) {
      setServerChannelCount(meta.channelCount);
    }
    setCatalogLoaded(true);
    return meta;
  }, [source.presetId]);

  const hydrateFullCatalog = useCallback(async (): Promise<M3uChannel[]> => {
    const server = await fetchPlaylistCatalogFromApi(source.presetId);
    setBaseChannels(server.channels);
    if (server.channels.length > 0) {
      setServerChannelCount(server.channels.length + getManualChannelCount());
    }
    setChannelsHydrated(true);
    return server.channels;
  }, [source.presetId]);

  const ensureFullCatalog = useCallback(async (): Promise<M3uChannel[]> => {
    if (channelsHydrated && baseChannels.length > 0) {
      return baseChannels;
    }
    if (fullHydratePromise.current) {
      return fullHydratePromise.current;
    }
    const promise = hydrateFullCatalog().catch(() => {
      fullHydratePromise.current = null;
      setChannelsHydrated(true);
      return [] as M3uChannel[];
    });
    fullHydratePromise.current = promise;
    return promise;
  }, [baseChannels, channelsHydrated, hydrateFullCatalog]);

  /** Meta only on auth ready — no automatic full JSON download. */
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    void (async () => {
      let meta = await loadMeta();
      if (cancelled) return;
      if (meta.channelCount === 0) {
        await new Promise((r) => setTimeout(r, 400));
        if (cancelled) return;
        meta = await loadMeta();
      }
      if (!meta.ok) {
        setChannelsHydrated(true);
        return;
      }
      if (meta.channelCount === 0) {
        setChannelsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, loadMeta]);

  useEffect(() => {
    if (channels.length === 0 || registrySynced.current) return;
    registrySynced.current = true;
    const timer = setTimeout(() => {
      void syncChannelRegistry(channels, source.presetId).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [channels, source.presetId]);

  const reloadFromCache = useCallback(async () => {
    const meta = await loadMeta();
    if (meta.ok && meta.channelCount > 0) {
      fullHydratePromise.current = null;
      registrySynced.current = false;
      await hydrateFullCatalog();
    } else {
      setBaseChannels([]);
      setChannelsHydrated(true);
    }
  }, [loadMeta, hydrateFullCatalog]);

  const refreshCatalog = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await refreshPlaylistCatalogOnServer(source.presetId);
      fullHydratePromise.current = null;
      registrySynced.current = false;
      const meta = await loadMeta();
      if (!meta.ok || meta.channelCount === 0) {
        throw new Error("No channels after refresh — check server logs.");
      }
      const parsed = await hydrateFullCatalog();
      if (parsed.length === 0) {
        throw new Error("No channels after refresh — check server logs.");
      }

      const manual =
        getManualChannelCount() <= 500
          ? listManualChannelEntries().map((e) => e.channel)
          : [];
      void syncChannelRegistry(mergeBuiltinAndManual(parsed, manual), source.presetId).catch(
        () => {},
      );

      log.info("Catalog persisted (server)", {
        presetId: source.presetId,
        channelCount: meta.channelCount,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load catalog";
      setError(msg);
      log.warn("Catalog refresh failed", {
        presetId: source.presetId,
        error: msg,
      });
    } finally {
      setBusy(false);
      setCatalogLoaded(true);
      setChannelsHydrated(true);
    }
  }, [source.presetId, loadMeta, hydrateFullCatalog]);

  const registered = (serverChannelCount ?? 0) > 0 || baseChannels.length > 0;
  const manualChannelCount = useMemo(() => getManualChannelCount(), [manualEpoch]);

  const metaValue = useMemo<Omit<CatalogContextValue, "channels">>(
    () => ({
      busy,
      error,
      channelCount,
      builtinChannelCount: baseChannels.length,
      manualChannelCount,
      catalogLoaded,
      channelsHydrated,
      metaFailed,
      registered,
      refreshCatalog,
      reloadFromCache,
      ensureFullCatalog,
      clearError: () => setError(null),
    }),
    [
      busy,
      error,
      channelCount,
      baseChannels.length,
      manualChannelCount,
      catalogLoaded,
      channelsHydrated,
      metaFailed,
      registered,
      refreshCatalog,
      reloadFromCache,
      ensureFullCatalog,
    ],
  );

  return (
    <CatalogMetaCtx.Provider value={metaValue}>
      <CatalogChannelsCtx.Provider value={channels}>
        {children}
      </CatalogChannelsCtx.Provider>
    </CatalogMetaCtx.Provider>
  );
}

export function useCatalogMeta(): Omit<CatalogContextValue, "channels"> {
  const ctx = useContext(CatalogMetaCtx);
  if (!ctx) {
    throw new Error("useCatalogMeta requires CatalogProvider");
  }
  return ctx;
}

export function useCatalogChannels(): M3uChannel[] {
  return useContext(CatalogChannelsCtx);
}

export function useCatalogContext(): CatalogContextValue {
  const meta = useCatalogMeta();
  const channelsList = useCatalogChannels();
  return useMemo(
    () => ({ ...meta, channels: channelsList }),
    [meta, channelsList],
  );
}
