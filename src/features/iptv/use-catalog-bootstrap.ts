"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BuiltinPlaylistSource } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { parseM3u } from "@/core/playlist/m3u-parse";
import { mergeBuiltinAndManual } from "@/lib/channels/merge-catalog";
import {
  listManualChannelEntries,
  subscribeManualChannels,
} from "@/lib/channels/manual-channels-store";
import {
  getRegisteredBuiltin,
  upsertRegisteredBuiltin,
} from "@/lib/playlists/source-registry";
import {
  getParsedPlaylist,
  putParsedPlaylist,
} from "@/lib/storage/playlist-cache-db";
import { syncChannelRegistry } from "@/features/health/registry-sync";
import { zendeFetch } from "@/lib/auth/zende-fetch";

const log = createClientLogger("features.iptv.catalogBootstrap");

export function useCatalogBootstrap(source: BuiltinPlaylistSource) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseChannels, setBaseChannels] = useState<M3uChannel[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [manualEpoch, setManualEpoch] = useState(0);

  useEffect(() => subscribeManualChannels(() => setManualEpoch((n) => n + 1)), []);

  const channels = useMemo(() => {
    const manual = listManualChannelEntries().map((e) => e.channel);
    return mergeBuiltinAndManual(baseChannels, manual);
  }, [baseChannels, manualEpoch]);

  const channelCount = catalogLoaded ? channels.length : null;

  const reloadFromCache = useCallback(async () => {
    const cached = await getParsedPlaylist(source.presetId);
    const list = cached?.channels ?? [];
    setBaseChannels(list);
    setCatalogLoaded(true);
  }, [source.presetId]);

  useEffect(() => {
    let cancelled = false;
    void getParsedPlaylist(source.presetId)
      .then((cached) => {
        if (cancelled) return;
        const list = cached?.channels ?? [];
        setBaseChannels(list);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoaded(true);
      });
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
      const res = await zendeFetch(`/api/playlists/builtin/${source.presetId}`, {
        method: "GET",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body?.error === "string" ? body.error : `HTTP ${res.status}`,
        );
      }
      const text = await res.text();
      const parsed = parseM3u(text);
      if (parsed.length === 0) {
        throw new Error("Playlist parsed with zero channels — check upstream.");
      }

      await putParsedPlaylist({
        presetId: source.presetId,
        updatedAt: Date.now(),
        channels: parsed,
      });

      upsertRegisteredBuiltin({
        kind: "builtin",
        presetId: source.presetId,
        label: source.label,
        addedAt: Date.now(),
        channelCount: parsed.length,
      });

      setBaseChannels(parsed);
      log.info("Catalog cached locally", {
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

  const registered = Boolean(getRegisteredBuiltin(source.presetId));

  const manualChannelCount = useMemo(
    () => listManualChannelEntries().length,
    [manualEpoch],
  );

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
