"use client";

import dynamic from "next/dynamic";
import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import {
  FastForward,
  Gauge,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture,
  Play,
  Rewind,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  exitPresentationFullscreen,
  getPresentationFullscreenElement,
  requestFullscreenElement,
  tryWebkitVideoEnterFullscreen,
  tryWebkitVideoExitFullscreen,
  videoWebkitDisplayingFullscreen,
} from "@/lib/player/fullscreen-helpers";
import { mergeBuiltinAndManual } from "@/lib/channels/merge-catalog";
import {
  listManualChannelEntries,
  subscribeManualChannels,
} from "@/lib/channels/manual-channels-store";
import { BrowseShellRefContext } from "@/components/glass/browse-chrome";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { getParsedPlaylist } from "@/lib/storage/playlist-cache-db";
import { padFrequentRingWithCatalog } from "@/lib/watch/watch-channel-ring";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import type { PlayerError, PlayerSession } from "@/components/player/stream-player";

const StreamPlayer = dynamic(
  () =>
    import("@/components/player/stream-player").then((m) => m.StreamPlayer),
  { ssr: false },
);
import { getWatchReturnHref } from "@/lib/navigation/watch-browse-origin";
import {
  createWatchUrl,
  fetchWatchSessionMeta,
  type WatchSessionMeta,
} from "@/lib/navigation/watch-url";
import { cn } from "@/lib/utils";
import {
  FrequentChannelPeek,
} from "@/components/watch/frequent-channel-peek";
import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { ChannelResolutionBadge } from "@/components/tv/channel-resolution-badge";
import { queuePlaybackHealthProbe } from "@/features/health/queue-playback-health-probe";
import type { ViewingEntry } from "@/lib/watch/viewing-stats";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import {
  listTopFrequentChannels,
  notifyViewingStatsUpdated,
  recordPlaybackStart,
  subscribeViewingStats,
} from "@/lib/watch/viewing-stats";

const FREQUENT_RING = 15;

/** Hide top/bottom chrome after this many ms with no pointer activity (unless hovering chrome). */
const CHROME_IDLE_MS = 3000;

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function navigateRingEntry(
  ring: ViewingEntry[],
  currentCanonicalUrl: string | null,
  delta: number,
): ViewingEntry | null {
  if (!currentCanonicalUrl || ring.length === 0) return null;
  let idx = ring.findIndex((e) => e.url === currentCanonicalUrl);
  if (idx < 0) {
    idx = delta > 0 ? -1 : ring.length;
  }
  const nextIdx =
    (((idx + delta) % ring.length) + ring.length) % ring.length;
  return ring[nextIdx] ?? null;
}

function bufferedAheadRatio(
  video: HTMLVideoElement,
  duration: number,
  currentTime: number,
): number {
  if (!duration || !Number.isFinite(duration)) return 0;
  const b = video.buffered;
  if (!b.length) return 0;
  let end = 0;
  for (let i = 0; i < b.length; i++) {
    if (currentTime >= b.start(i) && currentTime <= b.end(i)) {
      end = b.end(i);
      break;
    }
  }
  if (!end && b.length) end = b.end(b.length - 1);
  return Math.min(1, Math.max(0, end / duration));
}

export function WatchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id");
  const legacyUrlEncoded = searchParams.get("url");

  const decodedLegacyUrl = useMemo(() => {
    if (!legacyUrlEncoded) return null;
    try {
      return decodeURIComponent(legacyUrlEncoded);
    } catch {
      return legacyUrlEncoded;
    }
  }, [legacyUrlEncoded]);

  const [sessionMeta, setSessionMeta] = useState<WatchSessionMeta | null>(null);
  const [sessionMetaError, setSessionMetaError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(sessionId));
  /** Old bookmarks used `?url=`; migrate to `?id=` so playback uses the proxy and the bar stays clean. */
  const [legacyBridge, setLegacyBridge] = useState<
    "none" | "working" | "aborted"
  >("none");

  useEffect(() => {
    if (sessionId || !decodedLegacyUrl) {
      queueMicrotask(() => setLegacyBridge("none"));
      return;
    }
    queueMicrotask(() => setLegacyBridge("working"));
    let cancelled = false;
    void (async () => {
      try {
        const t = searchParams.get("title")?.trim() || "Live";
        const lg = searchParams.get("logo")?.trim();
        const grp = searchParams.get("group")?.trim();
        const href = await createWatchUrl({
          url: decodedLegacyUrl,
          name: t,
          ...(lg ? { tvgLogo: lg } : {}),
          ...(grp ? { groupTitle: grp } : {}),
        });
        if (!cancelled) router.replace(href);
      } catch {
        if (!cancelled) setLegacyBridge("aborted");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, decodedLegacyUrl, router, searchParams]);

  useEffect(() => {
    if (!sessionId) {
      queueMicrotask(() => {
        setSessionLoading(false);
        setSessionMeta(null);
        setSessionMetaError(null);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setSessionLoading(true));
    void fetchWatchSessionMeta(sessionId)
      .then((m) => {
        if (!cancelled) {
          setSessionMeta(m);
          setSessionMetaError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSessionMetaError(
            e instanceof Error ? e.message : "Playback session expired.",
          );
          setSessionMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const title =
    sessionMeta?.title ?? searchParams.get("title")?.trim() ?? "Live";
  const logo =
    sessionMeta?.logo?.trim() ??
    searchParams.get("logo")?.trim() ??
    undefined;
  const group =
    sessionMeta?.group?.trim() ??
    searchParams.get("group")?.trim() ??
    undefined;

  const playbackSrc = useMemo(() => {
    if (legacyBridge === "working") return null;
    if (sessionMeta?.playbackUrl) return sessionMeta.playbackUrl;
    if (sessionId && sessionLoading) return null;
    if (decodedLegacyUrl) return decodedLegacyUrl;
    return null;
  }, [
    legacyBridge,
    sessionMeta,
    sessionId,
    sessionLoading,
    decodedLegacyUrl,
  ]);

  const canonicalUrl = useMemo(() => {
    if (sessionMeta?.canonicalUrl) return sessionMeta.canonicalUrl;
    return decodedLegacyUrl;
  }, [sessionMeta, decodedLegacyUrl]);

  const { displayName: titleDisplay, resolutionLabel: titleResolutionBadge } =
    useMemo(() => parseChannelLabel(title), [title]);

  const lastRecordedUrl = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [statsEpoch, setStatsEpoch] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fs, setFs] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [bufferRatio, setBufferRatio] = useState(0);
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(
    null,
  );
  const [playerFatalError, setPlayerFatalError] = useState<PlayerError | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [pipActive, setPipActive] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [catalogChannels, setCatalogChannels] = useState<M3uChannel[]>([]);
  /** Viewing stats read localStorage; server snapshot has no entries — defer peek until mounted. */
  const [ringPeekClientReady, setRingPeekClientReady] = useState(false);

  const chromeIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chromeHoverRef = useRef(false);

  const [catalogMergeEpoch, setCatalogMergeEpoch] = useState(0);

  const frequentRing = useMemo(() => {
    void statsEpoch;
    const base = listTopFrequentChannels(FREQUENT_RING);
    if (catalogChannels.length === 0) return base;
    return padFrequentRingWithCatalog(base, catalogChannels, {
      targetSize: FREQUENT_RING,
      currentGroupTitle: group ?? null,
    });
  }, [statsEpoch, catalogChannels, group]);

  useEffect(() => {
    return subscribeViewingStats(() =>
      setStatsEpoch((n) => n + 1),
    );
  }, []);

  useEffect(() => {
    queueMicrotask(() => setRingPeekClientReady(true));
  }, []);

  useEffect(() => {
    const bump = () => setCatalogMergeEpoch((n) => n + 1);
    window.addEventListener("zenede-playlist-cache-updated", bump);
    const unsubManual = subscribeManualChannels(bump);
    return () => {
      window.removeEventListener("zenede-playlist-cache-updated", bump);
      unsubManual();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const presetId = BUILTIN_PLAYLIST_SOURCES[0]?.presetId;
    if (!presetId) return;
    void getParsedPlaylist(presetId).then((cached) => {
      if (cancelled) return;
      const base = cached?.channels ?? [];
      const manual = listManualChannelEntries().map((e) => e.channel);
      setCatalogChannels(mergeBuiltinAndManual(base, manual));
    });
    return () => {
      cancelled = true;
    };
  }, [catalogMergeEpoch]);

  useEffect(() => {
    if (
      !playbackSrc ||
      !canonicalUrl ||
      lastRecordedUrl.current === canonicalUrl
    )
      return;
    lastRecordedUrl.current = canonicalUrl;
    recordPlaybackStart({
      url: canonicalUrl,
      name: title,
      ...(logo ? { tvgLogo: logo } : {}),
      ...(group ? { groupTitle: group } : {}),
    });
    notifyViewingStatsUpdated();
    queuePlaybackHealthProbe({
      url: canonicalUrl,
      label: title,
      presetId: BUILTIN_PLAYLIST_SOURCES[0]?.presetId,
    });
  }, [playbackSrc, canonicalUrl, title, logo, group]);

  useEffect(() => {
    const sync = () =>
      setFs(
        Boolean(getPresentationFullscreenElement()) ||
          Boolean(
            videoRef.current &&
              videoWebkitDisplayingFullscreen(videoRef.current),
          ),
      );
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    document.addEventListener("mozfullscreenchange", sync);
    document.addEventListener("MSFullscreenChange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      document.removeEventListener("mozfullscreenchange", sync);
      document.removeEventListener("MSFullscreenChange", sync);
    };
  }, [playbackSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onBegin = () => setFs(true);
    const onEnd = () => setFs(false);
    v.addEventListener("webkitbeginfullscreen", onBegin);
    v.addEventListener("webkitendfullscreen", onEnd);
    return () => {
      v.removeEventListener("webkitbeginfullscreen", onBegin);
      v.removeEventListener("webkitendfullscreen", onEnd);
    };
  }, [playbackSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [playbackSrc]);

  const clearChromeIdleTimer = useCallback(() => {
    if (chromeIdleTimerRef.current) {
      clearTimeout(chromeIdleTimerRef.current);
      chromeIdleTimerRef.current = null;
    }
  }, []);

  const scheduleChromeHide = useCallback(() => {
    clearChromeIdleTimer();
    chromeIdleTimerRef.current = setTimeout(() => {
      if (!chromeHoverRef.current) setChromeVisible(false);
    }, CHROME_IDLE_MS);
  }, [clearChromeIdleTimer]);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleChromeHide();
  }, [scheduleChromeHide]);

  const onChromePointerEnter = useCallback(() => {
    chromeHoverRef.current = true;
    clearChromeIdleTimer();
    setChromeVisible(true);
  }, [clearChromeIdleTimer]);

  const onChromePointerLeave = useCallback(() => {
    chromeHoverRef.current = false;
    scheduleChromeHide();
  }, [scheduleChromeHide]);

  useEffect(() => {
    queueMicrotask(revealChrome);
    const onActivity = () => revealChrome();
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    return () => {
      clearChromeIdleTimer();
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [revealChrome, clearChromeIdleTimer]);

  const ringNavAvailable = frequentRing.length > 0 && Boolean(canonicalUrl);

  const prevEntry =
    ringNavAvailable && canonicalUrl
      ? navigateRingEntry(frequentRing, canonicalUrl, -1)
      : null;
  const nextEntry =
    ringNavAvailable && canonicalUrl
      ? navigateRingEntry(frequentRing, canonicalUrl, 1)
      : null;

  const jumpToRingChannel = useCallback(
    (entry: ViewingEntry) => {
      void (async () => {
        try {
          const href = await createWatchUrl({
            url: entry.url,
            name: entry.name,
            ...(entry.tvgLogo ? { tvgLogo: entry.tvgLogo } : {}),
            ...(entry.groupTitle ? { groupTitle: entry.groupTitle } : {}),
          });
          router.replace(href);
        } catch {
          /* ignore */
        }
      })();
    },
    [router],
  );

  const watchFavoriteChannel = useMemo(
    () =>
      canonicalUrl
        ? {
            url: canonicalUrl,
            name: title,
            ...(logo ? { tvgLogo: logo } : {}),
            ...(group ? { groupTitle: group } : {}),
          }
        : null,
    [canonicalUrl, title, logo, group],
  );

  const seekRatio =
    Number.isFinite(duration) && duration > 0
      ? Math.min(1, Math.max(0, currentTime / duration))
      : null;

  const bindVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const syncBuffer = () => {
      const nextDuration = v.duration;
      const nextTime = v.currentTime;
      setBufferRatio(
        Number.isFinite(nextDuration) && nextDuration > 0
          ? bufferedAheadRatio(v, nextDuration, nextTime)
          : 0,
      );
    };
    const onTime = () => setCurrentTime(v.currentTime);
    const onMeta = () => {
      setDuration(v.duration);
      syncBuffer();
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVol = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    const onRate = () => setPlaybackRate(v.playbackRate);
    const onProgress = () => syncBuffer();
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("canplaythrough", onCanPlay);
    v.addEventListener("ratechange", onRate);
    v.addEventListener("progress", onProgress);
    setMuted(v.muted);
    setVolume(v.volume);
    setPlaying(!v.paused);
    setDuration(v.duration);
    setCurrentTime(v.currentTime);
    setPlaybackRate(v.playbackRate);
    syncBuffer();
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("canplaythrough", onCanPlay);
      v.removeEventListener("ratechange", onRate);
      v.removeEventListener("progress", onProgress);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => setPlayerFatalError(null));
    return bindVideo();
  }, [bindVideo, playbackSrc]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const setVol = useCallback((next: number) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Math.min(1, Math.max(0, next));
    v.volume = t;
    if (t > 0 && v.muted) v.muted = false;
    setVolume(t);
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current;

    if (getPresentationFullscreenElement()) {
      void exitPresentationFullscreen().catch(() => {});
      return;
    }

    if (video && videoWebkitDisplayingFullscreen(video)) {
      if (tryWebkitVideoExitFullscreen(video)) return;
    }

    void (async () => {
      try {
        if (container) await requestFullscreenElement(container);
        else throw new Error("no container");
      } catch {
        try {
          if (video) await requestFullscreenElement(video);
          else throw new Error("no video");
        } catch {
          if (video && tryWebkitVideoEnterFullscreen(video)) {
            setFs(true);
          }
        }
      }
    })();
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === v) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch {
      /* ignore */
    }
  }, []);

  const skipSeconds = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    v.currentTime = Math.min(d, Math.max(0, v.currentTime + delta));
    setCurrentTime(v.currentTime);
  }, []);

  const applySpeed = useCallback((rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const onSeek = useCallback(
    (clientX: number, rect: DOMRect) => {
      const v = videoRef.current;
      if (!v || seekRatio === null) return;
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const x = clientX - rect.left;
      const t = (x / rect.width) * d;
      v.currentTime = Math.min(d, Math.max(0, t));
      setCurrentTime(v.currentTime);
    },
    [seekRatio],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      revealChrome();
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft" && prevEntry && !e.shiftKey) {
        e.preventDefault();
        jumpToRingChannel(prevEntry);
      } else if (e.code === "ArrowRight" && nextEntry && !e.shiftKey) {
        e.preventDefault();
        jumpToRingChannel(nextEntry);
      } else if (e.code === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        skipSeconds(-10);
      } else if (e.code === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        skipSeconds(10);
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === "KeyP" && e.shiftKey) {
        e.preventDefault();
        void togglePip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    togglePlay,
    toggleMute,
    toggleFullscreen,
    togglePip,
    router,
    prevEntry,
    nextEntry,
    jumpToRingChannel,
    skipSeconds,
    revealChrome,
  ]);

  const qualityEnabled =
    Boolean(playerSession?.hls?.levels?.length) &&
    !playerSession?.isNativeHls;
  const currentLoadLevel = playerSession?.hls?.loadLevel ?? -1;

  const qualityLabelShort = useMemo(() => {
    if (!qualityEnabled) return "—";
    const opts = playerSession?.getQualityOptions() ?? [];
    const hit = opts.find((q) => q.index === currentLoadLevel);
    const raw = hit?.label ?? "Auto";
    return raw.length > 5 ? raw.slice(0, 4) + "…" : raw;
  }, [qualityEnabled, playerSession, currentLoadLevel]);

  const qualityOptions = playerSession?.getQualityOptions() ?? [];

  /** Browser-only API: server snapshot must be false so SSR/hydration match; then client reads PiP support. */
  const pipSupported = useSyncExternalStore(
    () => () => {},
    () =>
      typeof document !== "undefined" &&
      Boolean(document.pictureInPictureEnabled),
    () => false,
  );

  const isVod =
    Number.isFinite(duration) && duration > 0 && duration !== Infinity;

  if ((sessionId && sessionLoading) || legacyBridge === "working") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-8 text-center text-white">
        <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden />
        <p className="text-[15px] text-white/55">Preparing playback…</p>
      </div>
    );
  }

  if (sessionMetaError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-8 text-center text-white">
        <p className="text-[17px] text-white/70">{sessionMetaError}</p>
        <Link
          href="/library"
          className="rounded-full bg-white px-6 py-2.5 text-[15px] font-semibold text-black"
        >
          Back to Library
        </Link>
      </div>
    );
  }

  if (!playbackSrc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-8 text-center text-white">
        <p className="text-[17px] text-white/70">No stream was selected.</p>
        <Link
          href="/"
          className="rounded-full bg-white px-6 py-2.5 text-[15px] font-semibold text-black"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const liveOrClock =
    !Number.isFinite(duration) || duration === Infinity ? (
      <span className="tabular-nums text-white/90">Live</span>
    ) : (
      <span className="tabular-nums text-white/90">
        {formatClock(currentTime)} / {formatClock(duration)}
      </span>
    );

  return (
    <BrowseShellRefContext.Provider value={containerRef}>
      <div
        ref={containerRef}
        className="fixed inset-0 z-0 overflow-hidden bg-black text-white"
      >
        <div className="absolute inset-0">
          <StreamPlayer
            ref={videoRef}
            src={playbackSrc}
            controls={false}
            onSessionChange={setPlayerSession}
            onError={(err) => {
              console.warn("[player] hls error", err);
              if (err.fatal) setPlayerFatalError(err);
            }}
            className="absolute inset-0 h-full w-full object-contain"
          />

          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300",
              buffering && !playerFatalError ? "opacity-100" : "opacity-0",
            )}
          >
            <ZenedeGlass variant="panelCompact" className="pointer-events-none">
              <div className="flex items-center gap-3 px-5 py-3">
                <Loader2
                  className="h-8 w-8 shrink-0 animate-spin text-white"
                  aria-hidden
                />
                <div className="text-left">
                  <p className="text-[14px] font-semibold text-white">
                    Buffering
                  </p>
                  <p className="text-[12px] text-white/55">
                    Network or stream is catching up
                  </p>
                </div>
              </div>
            </ZenedeGlass>
          </div>

          {playerFatalError && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <ZenedeGlass variant="panelCompact" className="pointer-events-none max-w-sm">
                <div className="px-5 py-4 text-left">
                  <p className="text-[14px] font-semibold text-red-400">
                    Playback failed
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-white/60 break-all">
                    {playerFatalError.details}
                    {playerFatalError.reason ? ` — ${playerFatalError.reason}` : ""}
                  </p>
                </div>
              </ZenedeGlass>
            </div>
          )}

          <div
            className={cn(
              "absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 transition-opacity duration-300 ease-out motion-reduce:transition-none",
              "bg-gradient-to-b from-black/85 via-black/40 to-transparent",
              "p-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]",
              chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onMouseEnter={onChromePointerEnter}
            onMouseLeave={onChromePointerLeave}
          >
            <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2">
              <GlassTextButton
                onClick={() => router.replace(getWatchReturnHref())}
              >
                ← Back
              </GlassTextButton>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold tracking-tight sm:text-[17px]">
                    {titleDisplay}
                  </h1>
                  {titleResolutionBadge ? (
                    <ChannelResolutionBadge
                      label={titleResolutionBadge}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
                {!Number.isFinite(duration) || duration === Infinity ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-emerald-400/90">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    Live
                  </span>
                ) : null}
              </div>
              {watchFavoriteChannel ? (
                <FavoriteStarButton
                  channel={watchFavoriteChannel}
                  size="md"
                  className="shrink-0"
                />
              ) : null}
            </div>
            <Link
              href="/library"
              className={cn(
                "pointer-events-auto hidden min-h-11 shrink-0 items-center rounded-full px-3 py-2 text-[15px] font-medium sm:flex",
                "text-white/70 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white",
              )}
            >
              Library
            </Link>
          </div>

        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-30 w-full transition-opacity duration-300 ease-out motion-reduce:transition-none",
            chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onMouseEnter={onChromePointerEnter}
          onMouseLeave={onChromePointerLeave}
        >
          <div className="mx-auto flex w-full max-w-[min(100vw,1920px)] flex-col gap-2 px-2 sm:gap-2.5 sm:px-4">
            {ringPeekClientReady &&
            ringNavAvailable &&
            prevEntry &&
            nextEntry ? (
              <div className="pointer-events-auto relative z-[1]">
                <FrequentChannelPeek
                  ring={frequentRing}
                  streamUrl={canonicalUrl}
                  nowTitle={title}
                  nowLogo={logo}
                  nowGroup={group}
                  onJumpChannel={jumpToRingChannel}
                />
              </div>
            ) : null}

            <ZenedeGlass
              variant="panel"
              className={cn(
                "relative w-full rounded-t-[28px] rounded-b-none border-x-0 border-b-0",
                "shadow-[0_-18px_48px_-24px_rgba(0,0,0,0.85)]",
              )}
            >
              <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pt-4">
                {seekRatio !== null ? (
                  <SeekBar
                    ratio={seekRatio}
                    bufferRatio={bufferRatio}
                    onSeek={onSeek}
                    disabled={!Number.isFinite(duration) || duration <= 0}
                  />
                ) : (
                  <div className="relative mb-4 h-2 w-full overflow-hidden rounded-full bg-white/15">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-white/28 transition-[width] duration-300"
                      style={{
                        width: `${Math.min(100, bufferRatio * 100 || 12)}%`,
                      }}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-between">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isVod ? (
                    <GlassIconButton
                      aria-label="Back 10 seconds"
                      onClick={() => skipSeconds(-10)}
                    >
                      <Rewind className="h-5 w-5" />
                    </GlassIconButton>
                  ) : null}

                  <GlassPrimaryButton
                    aria-label={playing ? "Pause" : "Play"}
                    onClick={togglePlay}
                  >
                    {playing ? (
                      <Pause className="h-7 w-7" fill="currentColor" />
                    ) : (
                      <Play className="h-7 w-7 pl-1" fill="currentColor" />
                    )}
                  </GlassPrimaryButton>

                  {isVod ? (
                    <GlassIconButton
                      aria-label="Forward 10 seconds"
                      onClick={() => skipSeconds(10)}
                    >
                      <FastForward className="h-5 w-5" />
                    </GlassIconButton>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Menu.Root modal={false}>
                    <GlassIconMenuTrigger
                      aria-label="Playback speed"
                      disabled={!isVod}
                    >
                      <Gauge className="h-5 w-5" />
                    </GlassIconMenuTrigger>
                    <Menu.Portal>
                      <Menu.Positioner
                        side="top"
                        align="end"
                        sideOffset={10}
                        className="z-[100]"
                      >
                        <Menu.Popup className="min-w-[140px] origin-bottom rounded-2xl border border-white/[0.14] bg-black/55 p-1 shadow-2xl outline-none backdrop-blur-2xl backdrop-saturate-150">
                          <Menu.Viewport>
                            <Menu.Group>
                              <Menu.GroupLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                                Speed
                              </Menu.GroupLabel>
                              {PLAYBACK_SPEEDS.map((r) => (
                                <Menu.Item
                                  key={r}
                                  className={cn(
                                    "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] text-white/90 outline-none",
                                    "data-[highlighted]:bg-white/12",
                                  )}
                                  onClick={() => applySpeed(r)}
                                >
                                  {r === 1 ? "Normal" : `${r}×`}
                                  {playbackRate === r ? (
                                    <span className="text-emerald-400">✓</span>
                                  ) : null}
                                </Menu.Item>
                              ))}
                            </Menu.Group>
                          </Menu.Viewport>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>

                  <Menu.Root modal={false}>
                    <GlassIconMenuTrigger
                      aria-label="Quality"
                      disabled={!qualityEnabled}
                    >
                      <span className="max-w-[3.25rem] truncate text-[12px] font-semibold tabular-nums">
                        {qualityLabelShort}
                      </span>
                    </GlassIconMenuTrigger>
                    <Menu.Portal>
                      <Menu.Positioner
                        side="top"
                        align="end"
                        sideOffset={10}
                        className="z-[100]"
                      >
                        <Menu.Popup className="min-w-[180px] origin-bottom rounded-2xl border border-white/[0.14] bg-black/55 p-1 shadow-2xl outline-none backdrop-blur-2xl backdrop-saturate-150">
                          <Menu.Viewport>
                            <Menu.Group>
                              <Menu.GroupLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                                Quality
                              </Menu.GroupLabel>
                              {qualityOptions.length === 0 ? (
                                <p className="px-3 py-2 text-[13px] text-white/50">
                                  {playerSession?.isNativeHls
                                    ? "Use Safari native HLS (no manual ladder)."
                                    : "Single track or not loaded yet."}
                                </p>
                              ) : (
                                qualityOptions.map((q) => (
                                  <Menu.Item
                                    key={q.index}
                                    className={cn(
                                      "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] text-white/90 outline-none",
                                      "data-[highlighted]:bg-white/12",
                                    )}
                                    onClick={() =>
                                      playerSession?.setQualityLevel(q.index)
                                    }
                                  >
                                    {q.label}
                                    {currentLoadLevel === q.index ? (
                                      <span className="text-emerald-400">✓</span>
                                    ) : null}
                                  </Menu.Item>
                                ))
                              )}
                            </Menu.Group>
                          </Menu.Viewport>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>

                  <div className="hidden items-center gap-2 sm:flex">
                    <span className="text-[13px] text-white/45">Vol</span>
                    <input
                      aria-label="Volume"
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={volume}
                      onChange={(e) => setVol(Number(e.target.value))}
                      className={cn(
                        "h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-white/15",
                        "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
                      )}
                    />
                  </div>

                  <GlassIconButton
                    aria-label={muted ? "Unmute" : "Mute"}
                    onClick={toggleMute}
                  >
                    {muted ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </GlassIconButton>

                  {pipSupported ? (
                    <GlassIconButton
                      aria-label={
                        pipActive
                          ? "Exit picture in picture"
                          : "Picture in picture"
                      }
                      onClick={() => void togglePip()}
                    >
                      <PictureInPicture className="h-5 w-5" />
                    </GlassIconButton>
                  ) : null}

                  <GlassIconButton
                    aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
                    onClick={toggleFullscreen}
                  >
                    {fs ? (
                      <Minimize2 className="h-5 w-5" />
                    ) : (
                      <Maximize2 className="h-5 w-5" />
                    )}
                  </GlassIconButton>

                  <div className="tabular-nums text-[13px] text-white/55">
                    {liveOrClock}
                  </div>
                </div>
              </div>

              <p className="hidden text-center text-[11px] leading-relaxed text-white/35 sm:block">
                Skip ±10s: Shift+← → · PiP: Shift+P · If playback fails, the
                stream may be unsupported in this browser.
              </p>
            </div>
          </div>
        </ZenedeGlass>
          </div>
        </div>
        </div>
      </div>
    </BrowseShellRefContext.Provider>
  );
}

function GlassTextButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <ZenedeGlass variant="heroSecondary" className="inline-flex shrink-0">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-full px-3 py-2 text-[15px] font-medium text-white/90 outline-none",
          "hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white",
        )}
      >
        {children}
      </button>
    </ZenedeGlass>
  );
}

function GlassIconButton({
  children,
  className,
  disabled,
  onClick,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  "aria-label": string;
}) {
  return (
    <ZenedeGlass variant="iconChip" className={cn("inline-flex", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "flex h-12 min-w-12 items-center justify-center rounded-full text-white outline-none transition sm:h-11 sm:min-w-11",
          "hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white",
          "disabled:cursor-not-allowed disabled:opacity-35",
        )}
      >
        {children}
      </button>
    </ZenedeGlass>
  );
}

function GlassPrimaryButton({
  children,
  onClick,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  "aria-label": string;
}) {
  return (
    <ZenedeGlass variant="ctaPill" className="inline-flex">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className={cn(
          "flex h-16 min-w-16 items-center justify-center rounded-full text-black outline-none sm:h-14 sm:min-w-14",
          "focus-visible:ring-2 focus-visible:ring-white",
        )}
      >
        {children}
      </button>
    </ZenedeGlass>
  );
}

/** Menu trigger with the same liquid-glass shell as other icon controls. */
function GlassIconMenuTrigger({
  children,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <ZenedeGlass variant="iconChip" className={cn("inline-flex", className)}>
      <Menu.Trigger
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "flex h-12 min-w-12 items-center justify-center rounded-full bg-transparent text-white outline-none sm:h-11 sm:min-w-11",
          "hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white",
          "disabled:cursor-not-allowed disabled:opacity-35",
          "data-[popup-open]:bg-white/12",
        )}
      >
        {children}
      </Menu.Trigger>
    </ZenedeGlass>
  );
}

function SeekBar({
  ratio,
  bufferRatio,
  disabled,
  onSeek,
}: {
  ratio: number;
  bufferRatio: number;
  disabled: boolean;
  onSeek: (clientX: number, rect: DOMRect) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = barRef.current;
      if (!el || disabled) return;
      onSeek(clientX, el.getBoundingClientRect());
    },
    [disabled, onSeek],
  );

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      className={cn(
        "group relative mb-4 h-4 w-full cursor-pointer overflow-hidden rounded-full bg-white/12 sm:h-2.5",
        disabled && "cursor-default opacity-50",
      )}
      onPointerDown={(e) => {
        if (disabled) return;
        seekFromPointer(e.clientX);
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (disabled || e.buttons !== 1) return;
        seekFromPointer(e.clientX);
      }}
    >
      <div
        className="absolute inset-y-0 left-0 bg-white/22"
        style={{ width: `${Math.min(100, bufferRatio * 100)}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-white/90 to-white/70"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
