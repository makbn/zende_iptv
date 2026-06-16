"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

const log = createClientLogger("features.iptv.catalogBootstrap");

export function useCatalogBootstrap(source: BuiltinPlaylistSource) {
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

  useEffect(() => subscribeManualChannels(() => setManualEpoch((n) => n + 1)), []);

  useEffect(
    () =>
      subscribeCatalogCleared(() => {
        setBaseChannels([]);
        setServerChannelCount(0);
        setChannelsHydrated(true);
        setCatalogLoaded(true);
      }),
    [],
  );

  useEffect(() => {
    void hydrateManualChannelsFromApiOnce();
  }, []);

  const channels = useMemo(() => {
    const manual = getManualChannelCount() <= 500
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
    setServerChannelCount(meta.channelCount);
    setCatalogLoaded(true);
    return meta;
  }, [source.presetId]);

  const hydrateFullCatalog = useCallback(async () => {
    const server = await fetchPlaylistCatalogFromApi(source.presetId);
    setBaseChannels(server.channels);
    if (server.channels.length > 0) {
      setServerChannelCount(
        server.channels.length + getManualChannelCount(),
      );
    }
    setChannelsHydrated(true);
    return server;
  }, [source.presetId]);

  /** Meta first (milliseconds) — full JSON only when a screen needs channel rows. */
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
      if (meta.channelCount > 0) {
        void hydrateFullCatalog().catch(() => {
          if (!cancelled) setChannelsHydrated(true);
        });
      } else {
        setChannelsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, loadMeta, hydrateFullCatalog]);

  useEffect(() => {
    if (channels.length === 0) return;
    const timer = setTimeout(() => {
      void syncChannelRegistry(channels, source.presetId).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [channels, source.presetId]);

  const reloadFromCache = useCallback(async () => {
    const meta = await loadMeta();
    if (meta.channelCount > 0) {
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
      const meta = await loadMeta();
      if (meta.channelCount === 0) {
        throw new Error("No channels after refresh — check server logs.");
      }
      const { channels: parsed } = await hydrateFullCatalog();
      if (parsed.length === 0) {
        throw new Error("No channels after refresh — check server logs.");
      }

      log.info("Catalog persisted (server)", {
        presetId: source.presetId,
        channelCount: meta.channelCount,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load catalog";
      setError(msg);
      log.warn("Catalog bootstrap failed", {
        presetId: source.presetId,
        error: msg,
      });
    } finally {
      setBusy(false);
      setCatalogLoaded(true);
      setChannelsHydrated(true);
    }
  }, [source, loadMeta, hydrateFullCatalog]);

  const registered = (serverChannelCount ?? 0) > 0 || baseChannels.length > 0;

  const manualChannelCount = useMemo(() => getManualChannelCount(), [manualEpoch]);

  return {
    busy,
    error,
    channelCount,
    builtinChannelCount: baseChannels.length,
    manualChannelCount,
    channels,
    catalogLoaded,
    channelsHydrated,
    registered,
    refreshCatalog,
    reloadFromCache,
    clearError: () => setError(null),
  };
}
