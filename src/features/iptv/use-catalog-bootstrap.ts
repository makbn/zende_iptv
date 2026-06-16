"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BuiltinPlaylistSource } from "@/config/builtin-playlist-sources";
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
  refreshPlaylistCatalogOnServer,
} from "@/lib/playlists/server-catalog-api";
import { syncChannelRegistry } from "@/features/health/registry-sync";
import { subscribeCatalogCleared } from "@/lib/channels/catalog-events";

const log = createClientLogger("features.iptv.catalogBootstrap");

export function useCatalogBootstrap(source: BuiltinPlaylistSource) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseChannels, setBaseChannels] = useState<M3uChannel[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [manualEpoch, setManualEpoch] = useState(0);

  useEffect(() => subscribeManualChannels(() => setManualEpoch((n) => n + 1)), []);

  useEffect(
    () =>
      subscribeCatalogCleared(() => {
        setBaseChannels([]);
        setCatalogLoaded(true);
      }),
    [],
  );

  /** Restore manual streams from server once (also mirrors into localStorage). */
  useEffect(() => {
    void hydrateManualChannelsFromApiOnce();
  }, []);

  const channels = useMemo(() => {
    const manual = getManualChannelCount() <= 500
      ? listManualChannelEntries().map((e) => e.channel)
      : [];
    return mergeBuiltinAndManual(baseChannels, manual);
  }, [baseChannels, manualEpoch]);

  const channelCount = catalogLoaded
    ? baseChannels.length + getManualChannelCount()
    : null;

  const reloadFromCache = useCallback(async () => {
    const server = await fetchPlaylistCatalogFromApi(source.presetId);
    setBaseChannels(server.channels);
    setCatalogLoaded(true);
  }, [source.presetId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const server = await fetchPlaylistCatalogFromApi(source.presetId);
      if (cancelled) return;
      setBaseChannels(server.channels);
      setCatalogLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [source.presetId]);

  useEffect(() => {
    if (channels.length === 0) return;
    const timer = setTimeout(() => {
      void syncChannelRegistry(channels, source.presetId).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [channels, source.presetId]);

  const refreshCatalog = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await refreshPlaylistCatalogOnServer(source.presetId);
      const { channels: parsed, updatedAt } = await fetchPlaylistCatalogFromApi(
        source.presetId,
      );
      if (parsed.length === 0) {
        throw new Error("No channels after refresh — check server logs.");
      }

      setBaseChannels(parsed);
      log.info("Catalog persisted (server + IndexedDB mirror)", {
        presetId: source.presetId,
        channelCount: parsed.length,
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
    }
  }, [source]);

  const registered = baseChannels.length > 0;

  const manualChannelCount = useMemo(() => getManualChannelCount(), [manualEpoch]);

  return {
    busy,
    error,
    channelCount,
    /** Built-in index only (before your manual streams). */
    builtinChannelCount: baseChannels.length,
    manualChannelCount,
    channels,
    catalogLoaded,
    registered,
    refreshCatalog,
    reloadFromCache,
    clearError: () => setError(null),
  };
}
