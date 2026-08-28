"use client";

import { useEffect, useMemo, useState } from "react";

import { zendeFetch } from "@/lib/auth/zende-fetch";

export type LiveChannelProgramme = {
  id: string;
  title: string;
  description: string;
  startMs: number;
  stopMs: number;
};

type ChannelEpgResponse = {
  available?: boolean;
  identityAvailable?: boolean;
  current?: LiveChannelProgramme | null;
  next?: LiveChannelProgramme | null;
  indexVersion?: string;
  error?: string;
};

type GuideState = {
  current: LiveChannelProgramme | null;
  next: LiveChannelProgramme | null;
  indexVersion: string | null;
  identityAvailable: boolean;
};

const EMPTY_GUIDE: GuideState = {
  current: null,
  next: null,
  indexVersion: null,
  identityAvailable: false,
};
const MAX_REFRESH_MS = 15 * 60 * 1000;

export function useLiveChannelEpg(input: {
  enabled: boolean;
  providerId?: string | null;
  tvgId?: string | null;
  channelUrl?: string | null;
}) {
  const providerId = input.providerId?.trim() ?? "";
  const tvgId = input.tvgId?.trim() ?? "";
  const channelUrl = input.channelUrl?.trim() ?? "";
  const enabled = input.enabled && Boolean((providerId && tvgId) || channelUrl);
  const [guide, setGuide] = useState<GuideState>(EMPTY_GUIDE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!input.enabled) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, [input.enabled]);

  useEffect(() => {
    let disposed = false;
    let request: AbortController | null = null;
    let refreshTimer: number | null = null;

    if (!enabled) {
      queueMicrotask(() => {
        if (disposed) return;
        setGuide(EMPTY_GUIDE);
        setLoading(false);
        setError(null);
      });
      return () => {
        disposed = true;
      };
    }

    queueMicrotask(() => {
      if (disposed) return;
      setGuide(EMPTY_GUIDE);
      setLoading(true);
      setError(null);
    });

    const load = async () => {
      request?.abort();
      request = new AbortController();
      try {
        const response = await zendeFetch("/api/epg/channel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, tvgId, url: channelUrl }),
          signal: request.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as ChannelEpgResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Could not load programme information.");
        }
        if (disposed || request.signal.aborted) return;
        const nextGuide = {
          current: payload.current ?? null,
          next: payload.next ?? null,
          indexVersion: payload.indexVersion ?? null,
          identityAvailable: Boolean(payload.identityAvailable),
        };
        setGuide(nextGuide);
        setError(null);

        const untilBoundary = nextGuide.next
          ? nextGuide.next.startMs - Date.now() + 1_000
          : MAX_REFRESH_MS;
        const refreshIn = Math.min(MAX_REFRESH_MS, Math.max(10_000, untilBoundary));
        refreshTimer = window.setTimeout(() => void load(), refreshIn);
      } catch (cause) {
        if (disposed || request?.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Could not load programme information.");
        refreshTimer = window.setTimeout(() => void load(), 60_000);
      } finally {
        if (!disposed && !request?.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => {
      disposed = true;
      request?.abort();
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, [channelUrl, enabled, providerId, tvgId]);

  const visible = useMemo(() => {
    let current = guide.current;
    let next = guide.next;
    if (current && current.stopMs <= nowMs) current = null;
    if (next && next.startMs <= nowMs) {
      if (next.stopMs > nowMs) current = next;
      next = null;
    }
    return { current, next };
  }, [guide, nowMs]);

  return {
    ...visible,
    loading,
    error,
    nowMs,
    available: Boolean(visible.current || visible.next),
    identityAvailable: guide.identityAvailable,
    indexVersion: guide.indexVersion,
  };
}
