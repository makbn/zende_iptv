"use client";

import { Input } from "@appica/ui-react/input";
import { Slider } from "@appica/ui-react/slider";

import dynamic from "next/dynamic";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuGroupLabel, DropdownMenuItem, DropdownMenuTrigger } from "@appica/ui-react/dropdown-menu";
import Link from "next/link";
import {
  FastForward,
  Gauge,
  Maximize2,
  Minimize2,
  Circle,
  Subtitles,
  Languages,
  Info,
  Pause,
  PictureInPicture,
  Play,
  Rewind,
  Search,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button, buttonVariants } from "@appica/ui-react/button";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { contentTypeFromStreamUrl } from "@/lib/channels/content-type";
import { mergeBuiltinAndManual } from "@/lib/channels/merge-catalog";
import {
  listManualChannelEntries,
  subscribeManualChannels,
} from "@/lib/channels/manual-channels-store";
import { BrowseShellRefContext } from "@/components/layout/app-shell";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { getWatchReturnHref } from "@/lib/navigation/watch-browse-origin";
import {
  useCatalogChannels,
  useCatalogMeta,
} from "@/features/iptv/catalog-context";
import { listFavorites } from "@/lib/favorites/favorites-store";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import {
  buildChannelRing,
  type ChannelZapMode,
  ZAP_MODE_LABELS,
} from "@/lib/watch/watch-channel-ring";
import { Card } from "@appica/ui-react/card";
import type { PlayerError, PlayerSession } from "@/components/player/stream-player";

const StreamPlayer = dynamic(
  () =>
    import("@/components/player/stream-player").then((m) => m.StreamPlayer),
  { ssr: false },
);
import {
  createWatchUrl,
  fetchRecordingWatchMeta,
  fetchWatchSessionMeta,
  type WatchSessionMeta,
} from "@/lib/navigation/watch-url";
import { cn } from "@/lib/utils";
import {
  FrequentChannelPeek,
} from "@/components/watch/frequent-channel-peek";
import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { ChannelResolutionBadge } from "@/components/tv/channel-resolution-badge";
import { EpisodePlaybackControls } from "@/components/watch/episode-playback-controls";
import { SubtitleSearchPanel } from "@/components/watch/subtitle-search-panel";
import { queuePlaybackHealthProbe } from "@/features/health/queue-playback-health-probe";
import { useExternalSubtitles } from "@/lib/player/use-external-subtitles";
import type { ViewingEntry } from "@/lib/watch/viewing-stats";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import {
  listTopFrequentChannels,
  notifyViewingStatsUpdated,
  recordPlaybackStart,
  subscribeViewingStats,
} from "@/lib/watch/viewing-stats";
import {
  createPlaybackPositionSaver,
  getPlaybackPosition,
} from "@/lib/playback/playback-position";
import {
  REMOTE_COMMAND_EVENT,
  useRemoteControl,
} from "@/features/remote/remote-control-context";

const FREQUENT_RING = 15;
const ZAP_MODE_STORAGE = "zende.zapMode";

function readZapMode(): ChannelZapMode {
  if (typeof window === "undefined") return "frequent";
  const v = sessionStorage.getItem(ZAP_MODE_STORAGE);
  if (v === "favorites" || v === "group") return v;
  return "frequent";
}

function favoritesRingEntries(): ViewingEntry[] {
  return listFavorites().map((f) => ({
    url: f.url,
    name: f.name,
    ...(f.tvgLogo ? { tvgLogo: f.tvgLogo } : {}),
    ...(f.groupTitle ? { groupTitle: f.groupTitle } : {}),
    lastOpenedAt: f.addedAt,
    openCount: 0,
  }));
}

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

type PipCapableVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

function isPipAvailable(video?: HTMLVideoElement | null): boolean {
  if (typeof document === "undefined" || !video) return false;
  const pipVideo = video as PipCapableVideo;
  // iOS Safari: WebKit presentation mode is the reliable PiP API.
  if (pipVideo.webkitSupportsPresentationMode?.("picture-in-picture")) {
    return true;
  }
  if (video.disablePictureInPicture) return false;
  return Boolean(
    document.pictureInPictureEnabled &&
      typeof video.requestPictureInPicture === "function",
  );
}

function isPipActive(video?: HTMLVideoElement | null): boolean {
  if (!video) return false;
  const pipVideo = video as PipCapableVideo;
  if (pipVideo.webkitPresentationMode === "picture-in-picture") return true;
  return document.pictureInPictureElement === video;
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
  const remote = useRemoteControl();
  const searchParams = useSearchParams();
  const { ensureFullCatalog } = useCatalogMeta();
  const catalogFromContext = useCatalogChannels();
  const sessionId = searchParams.get("id");
  const recordingId = searchParams.get("recording");
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
  const [sessionLoading, setSessionLoading] = useState(
    () => Boolean(sessionId || recordingId),
  );
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
  }, [sessionId, decodedLegacyUrl, router, searchParams, recordingId]);

  useEffect(() => {
    let cancelled = false;

    if (sessionId) {
      queueMicrotask(() => setSessionLoading(true));
      setSessionMeta(null);
      setSessionMetaError(null);
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
    }

    if (recordingId) {
      queueMicrotask(() => setSessionLoading(true));
      setSessionMeta(null);
      setSessionMetaError(null);
      void fetchRecordingWatchMeta(recordingId)
        .then((m) => {
          if (!cancelled) {
            setSessionMeta(m);
            setSessionMetaError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setSessionMetaError(
              e instanceof Error ? e.message : "Recording unavailable.",
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
    }

    queueMicrotask(() => {
      setSessionLoading(false);
      setSessionMeta(null);
      setSessionMetaError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, recordingId]);

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
    if ((sessionId || recordingId) && sessionLoading) return null;
    if (decodedLegacyUrl) return decodedLegacyUrl;
    return null;
  }, [
    legacyBridge,
    sessionMeta,
    sessionId,
    recordingId,
    sessionLoading,
    decodedLegacyUrl,
  ]);

  const canonicalUrl = useMemo(() => {
    if (sessionMeta?.canonicalUrl) return sessionMeta.canonicalUrl;
    return decodedLegacyUrl;
  }, [sessionMeta, decodedLegacyUrl]);

  const playbackMeta = sessionMeta?.playback;
  const expectedDuration = playbackMeta?.durationSeconds ?? 0;
  const isRecordedPlayback = Boolean(recordingId);

  const resolvedPlaybackKind = useMemo(() => {
    if (playbackMeta?.contentKind) return playbackMeta.contentKind;
    if (!canonicalUrl) return undefined;
    const fromUrl = contentTypeFromStreamUrl(canonicalUrl);
    if (fromUrl === "movie") return "movie" as const;
    if (fromUrl === "series") return "episode" as const;
    if (fromUrl === "live") return "live" as const;
    return undefined;
  }, [playbackMeta?.contentKind, canonicalUrl]);

  const isVodContent =
    resolvedPlaybackKind === "movie" ||
    resolvedPlaybackKind === "episode" ||
    (sessionMeta?.playbackMode === "progressive" &&
      resolvedPlaybackKind !== "live");



  const { displayName: titleDisplay, resolutionLabel: titleResolutionBadge } =
    useMemo(() => parseChannelLabel(title), [title]);

  const lastRecordedUrl = useRef<string | null>(null);
  const resumedUrlRef = useRef<string | null>(null);
  const positionSaverRef = useRef<ReturnType<typeof createPlaybackPositionSaver> | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [statsEpoch, setStatsEpoch] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const effectiveDuration = useMemo(() => {
    const videoDur = duration;
    const expected = expectedDuration;
    if (Number.isFinite(videoDur) && videoDur > 0 && videoDur !== Infinity) {
      if (
        expected > 0 &&
        (videoDur < 2 || Math.abs(videoDur - expected) / expected > 0.25)
      ) {
        return expected;
      }
      return videoDur;
    }
    if (expected > 0) return expected;
    return videoDur;
  }, [duration, expectedDuration]);

  const isVodPlayback = isRecordedPlayback || isVodContent || (Number.isFinite(duration) && duration > 0 && resolvedPlaybackKind !== "live");
  const isLivePlayback =
    !isRecordedPlayback &&
    !isVodPlayback &&
    (resolvedPlaybackKind === "live" || resolvedPlaybackKind === undefined);

  const [fs, setFs] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [bufferRatio, setBufferRatio] = useState(0);
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(
    null,
  );
  const [subtitleSearchOpen, setSubtitleSearchOpen] = useState(false);
  const externalSubtitles = useExternalSubtitles(playerSession?.video ?? null);
  const [playerFatalError, setPlayerFatalError] = useState<PlayerError | null>(null);
  const [playerRetryEpoch, setPlayerRetryEpoch] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [remoteControlActive, setRemoteControlActive] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<{
    saved: number;
    url: string;
    timeLeft: number;
  } | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const [pipCapable, setPipCapable] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [catalogChannels, setCatalogChannels] = useState<M3uChannel[]>([]);
  const [zapMode, setZapMode] = useState<ChannelZapMode>("frequent");
  const [infoOpen, setInfoOpen] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingHint, setRecordingHint] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const remoteControlActiveState = Boolean(remote?.activeSession);
  /** Viewing stats read localStorage; server snapshot has no entries — defer peek until mounted. */
  const [ringPeekClientReady, setRingPeekClientReady] = useState(false);

  const chromeIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chromeHoverRef = useRef(false);

  const [catalogMergeEpoch, setCatalogMergeEpoch] = useState(0);

  useEffect(() => {
    queueMicrotask(() => setZapMode(readZapMode()));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(ZAP_MODE_STORAGE, zapMode);
    } catch {
      /* ignore */
    }
  }, [zapMode]);

  const channelRing = useMemo(() => {
    void statsEpoch;
    return buildChannelRing(zapMode, {
      targetSize: FREQUENT_RING,
      catalog: catalogChannels,
      frequentOrdered: listTopFrequentChannels(FREQUENT_RING),
      favoritesOrdered: favoritesRingEntries(),
      currentGroupTitle: group ?? null,
    });
  }, [statsEpoch, catalogChannels, group, zapMode]);

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
    window.addEventListener("zende-playlist-cache-updated", bump);
    const unsubManual = subscribeManualChannels(bump);
    return () => {
      window.removeEventListener("zende-playlist-cache-updated", bump);
      unsubManual();
    };
  }, []);

  useEffect(() => {
    void ensureFullCatalog();
  }, [ensureFullCatalog, catalogMergeEpoch]);

  useEffect(() => {
    const base = catalogFromContext;
    const manual = listManualChannelEntries().map((e) => e.channel);
    setCatalogChannels(mergeBuiltinAndManual(base, manual));
  }, [catalogFromContext, catalogMergeEpoch]);

  useEffect(() => {
    if (
      recordingId ||
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
      ...(playbackMeta ? { playback: playbackMeta } : {}),
    });
    notifyViewingStatsUpdated();
    queuePlaybackHealthProbe({
      url: canonicalUrl,
      label: title,
      presetId: BUILTIN_PLAYLIST_SOURCES[0]?.presetId,
    });
  }, [recordingId, playbackSrc, canonicalUrl, title, logo, group]);

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
    const syncPip = () => {
      setPipActive(isPipActive(v));
      setPipCapable(isPipAvailable(v));
    };
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    v.addEventListener("webkitpresentationmodechanged", syncPip);
    // iOS often reports PiP support only after media is ready / playing.
    v.addEventListener("loadedmetadata", syncPip);
    v.addEventListener("play", syncPip);
    syncPip();
    return () => {
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
      v.removeEventListener("webkitpresentationmodechanged", syncPip);
      v.removeEventListener("loadedmetadata", syncPip);
      v.removeEventListener("play", syncPip);
    };
  }, [playbackSrc, playerSession]);

  useEffect(() => {
    externalSubtitles.clearTracks();
    setSubtitleSearchOpen(false);
  }, [playbackSrc, externalSubtitles.clearTracks]);

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

  const ringNavAvailable = channelRing.length > 0 && Boolean(canonicalUrl);

  const prevEntry =
    ringNavAvailable && canonicalUrl
      ? navigateRingEntry(channelRing, canonicalUrl, -1)
      : null;
  const nextEntry =
    ringNavAvailable && canonicalUrl
      ? navigateRingEntry(channelRing, canonicalUrl, 1)
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

  const cycleZapMode = useCallback(() => {
    setZapMode((mode) => {
      const order: ChannelZapMode[] = ["frequent", "favorites", "group"];
      const idx = order.indexOf(mode);
      return order[(idx + 1) % order.length]!;
    });
  }, []);

  const watchFavoriteChannel = useMemo(() =>
      recordingId || !canonicalUrl
        ? null
        : {
            url: canonicalUrl,
            name: title,
            ...(logo ? { tvgLogo: logo } : {}),
            ...(group ? { groupTitle: group } : {}),
          },
    [recordingId, canonicalUrl, title, logo, group],
  );

  const seekRatio =
    isVodPlayback &&
    Number.isFinite(effectiveDuration) &&
    effectiveDuration > 0
      ? Math.min(1, Math.max(0, currentTime / effectiveDuration))
      : null;

  const bindVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const syncBuffer = () => {
      const nextDuration = v.duration;
      const nextTime = v.currentTime;
      const durForBuffer =
        Number.isFinite(effectiveDuration) && effectiveDuration > 0
          ? effectiveDuration
          : nextDuration;
      setBufferRatio(
        Number.isFinite(durForBuffer) && durForBuffer > 0
          ? bufferedAheadRatio(v, durForBuffer, nextTime)
          : 0,
      );
    };
    const onTime = () => {
      setCurrentTime(v.currentTime);
      setPlaying(!v.paused);
      positionSaverRef.current?.(v.currentTime);
    };
    const onMeta = () => {
      setDuration(v.duration);
      if (
        canonicalUrl &&
        resumedUrlRef.current !== canonicalUrl &&
        isVodContent
      ) {
        const saved = getPlaybackPosition(canonicalUrl);
        if (saved != null && saved > 5) {
          v.pause();
          setResumePrompt({ saved, url: canonicalUrl, timeLeft: 10 });
        }
        resumedUrlRef.current = canonicalUrl;
      }
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
  }, [canonicalUrl, effectiveDuration, expectedDuration, isVodContent]);

  useEffect(() => {
    positionSaverRef.current = createPlaybackPositionSaver(
      isVodContent ? canonicalUrl : null,
    );
  }, [canonicalUrl, isVodContent]);

  useEffect(() => {
    queueMicrotask(() => setPlayerFatalError(null));
    return bindVideo();
  }, [bindVideo, playbackSrc]);

  useEffect(() => {
    queueMicrotask(() => setAutoplayBlocked(false));
  }, [playbackSrc, playerRetryEpoch]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playbackSrc) return;

    const kickAutoplay = () => {
      if (!v.paused) {
        setAutoplayBlocked(false);
        return;
      }
      void v.play()
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true));
    };

    v.addEventListener("canplay", kickAutoplay);
    const timer = window.setTimeout(kickAutoplay, 200);
    return () => {
      v.removeEventListener("canplay", kickAutoplay);
      window.clearTimeout(timer);
    };
  }, [playbackSrc, playerRetryEpoch]);

  // ─── Resume Dialog Timer ──────────────────────────────────────────
  useEffect(() => {
    if (!resumePrompt) {
      if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
      return;
    }
    resumeTimerRef.current = setInterval(() => {
      setResumePrompt((prev) => {
        if (!prev) return null;
        if (prev.timeLeft <= 1) {
          // Auto-continue
          const v = videoRef.current;
          if (v) {
            const cap = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : prev.saved;
            v.currentTime = Math.min(prev.saved, cap - 1);
            setCurrentTime(v.currentTime);
            void v.play().catch(() => {
              v.dispatchEvent(new Event("pause"));
            });
          }
          return null;
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
    return () => {
      if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
    };
  }, [resumePrompt]);

  const handleResumeChoice = useCallback(
    (choice: "continue" | "start-over") => {
      const v = videoRef.current;
      const prompt = resumePrompt;
      setResumePrompt(null);
      if (!v || !prompt) return;

      if (choice === "continue") {
        const cap = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : prompt.saved;
        v.currentTime = Math.min(prompt.saved, cap - 1);
      } else {
        v.currentTime = 0;
      }
      setCurrentTime(v.currentTime);
      void v.play().catch(() => {
        v.dispatchEvent(new Event("pause"));
      });
    },
    [resumePrompt],
  );

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {
        v.dispatchEvent(new Event("pause"));
      });
    } else {
      v.pause();
    }
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
    const v = videoRef.current as PipCapableVideo | null;
    if (!v || !isPipAvailable(v)) return;
    try {
      // Must be playing for iOS WebKit PiP to accept the mode change.
      if (v.paused) {
        await v.play().catch(() => undefined);
      }
      if (typeof v.webkitSetPresentationMode === "function") {
        const nextMode =
          v.webkitPresentationMode === "picture-in-picture"
            ? "inline"
            : "picture-in-picture";
        v.webkitSetPresentationMode(nextMode);
        setPipActive(nextMode === "picture-in-picture");
        return;
      }
      if (document.pictureInPictureElement === v) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch {
      /* ignore — browser may deny PiP without a clear reason */
    }
  }, []);

  const skipSeconds = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const d =
      Number.isFinite(effectiveDuration) && effectiveDuration > 0
        ? effectiveDuration
        : v.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    v.currentTime = Math.min(d, Math.max(0, v.currentTime + delta));
    setCurrentTime(v.currentTime);
  }, [effectiveDuration]);

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
      const d =
        Number.isFinite(effectiveDuration) && effectiveDuration > 0
          ? effectiveDuration
          : v.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const x = clientX - rect.left;
      const t = (x / rect.width) * d;
      v.currentTime = Math.min(d, Math.max(0, t));
      setCurrentTime(v.currentTime);
    },
    [seekRatio, effectiveDuration],
  );

  const remoteAwareTogglePlay = useCallback(() => {
    if (remoteControlActiveState) {
      void remote?.sendTogglePlay();
      return;
    }
    togglePlay();
  }, [remoteControlActiveState, remote, togglePlay]);

  const remoteAwareSkipSeconds = useCallback(
    (delta: number) => {
      if (remoteControlActiveState) {
        void remote?.sendSkip(delta);
        return;
      }
      skipSeconds(delta);
    },
    [remoteControlActiveState, remote, skipSeconds],
  );

  const remoteAwareSeekTo = useCallback(
    (seconds: number) => {
      if (remoteControlActiveState) {
        void remote?.sendSeekTo(seconds);
        return;
      }
      const v = videoRef.current;
      if (!v || !isVodPlayback) return;
      const clamped = Math.min(
        Math.max(0, seconds),
        Number.isFinite(effectiveDuration) ? effectiveDuration : seconds,
      );
      v.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [remoteControlActiveState, remote, isVodPlayback, effectiveDuration],
  );

  useEffect(() => {
    const onRemoteCommand = (event: Event) => {
      const custom = event as CustomEvent<
        | { type: "togglePlay" | "play" | "pause" }
        | { type: "skip"; payload: { seconds: number } }
        | { type: "seekTo"; payload: { seconds: number } }
      >;
      const command = custom.detail;
      if (!command) return;

      if (command.type === "togglePlay") {
        togglePlay();
        return;
      }

      if (command.type === "play" || command.type === "pause") {
        const v = videoRef.current;
        if (!v) return;
        if (command.type === "play") {
          void v.play().catch(() => {});
        } else {
          v.pause();
        }
        return;
      }

      if (command.type === "skip") {
        skipSeconds(command.payload.seconds);
        return;
      }

      if (command.type === "seekTo") {
        const v = videoRef.current;
        if (!v || !isVodPlayback) return;
        const clamped = Math.min(
          Math.max(0, command.payload.seconds),
          Number.isFinite(effectiveDuration)
            ? effectiveDuration
            : command.payload.seconds,
        );
        v.currentTime = clamped;
        setCurrentTime(clamped);
      }
    };

    window.addEventListener(REMOTE_COMMAND_EVENT, onRemoteCommand);
    return () => window.removeEventListener(REMOTE_COMMAND_EVENT, onRemoteCommand);
  }, [togglePlay, skipSeconds, isVodPlayback, effectiveDuration]);

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
        skipSeconds(-15);
      } else if (e.code === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        skipSeconds(15);
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === "KeyP" && e.shiftKey) {
        e.preventDefault();
        void togglePip();
      } else if (e.code === "KeyI") {
        e.preventDefault();
        setInfoOpen((open) => !open);
      } else if (e.code === "ChannelUp" || e.code === "PageUp") {
        if (nextEntry) {
          e.preventDefault();
          jumpToRingChannel(nextEntry);
        }
      } else if (e.code === "ChannelDown" || e.code === "PageDown") {
        if (prevEntry) {
          e.preventDefault();
          jumpToRingChannel(prevEntry);
        }
      } else if (e.code === "KeyZ" && e.shiftKey) {
        e.preventDefault();
        cycleZapMode();
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
    cycleZapMode,
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
  const audioTracks = playerSession?.getAudioTracks() ?? [];
  const subtitleTracks = playerSession?.getSubtitleTracks() ?? [];
  const currentAudioTrack = playerSession?.hls?.audioTrack ?? 0;
  const currentSubtitleTrack = playerSession?.hls?.subtitleTrack ?? -1;
  const hasBuiltinSubtitles = subtitleTracks.length > 1;
  const showSubtitleControls = isVodPlayback;

  const handleBuiltinSubtitle = useCallback(
    (index: number) => {
      playerSession?.setSubtitleTrack(index);
      if (index < 0) {
        externalSubtitles.markOff();
      } else {
        externalSubtitles.turnOffExternal();
        externalSubtitles.markBuiltinActive();
      }
    },
    [externalSubtitles, playerSession],
  );

  const handleExternalSubtitle = useCallback(
    (trackId: string) => {
      playerSession?.setSubtitleTrack(-1);
      externalSubtitles.selectExternalTrack(trackId);
    },
    [externalSubtitles, playerSession],
  );

  const startRecording = useCallback(async () => {
    if (!canonicalUrl || recordingId || !isLivePlayback) return;
    setRecordingBusy(true);
    setRecordingHint(null);
    try {
      const res = await zendeFetch("/api/recordings/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelUrl: canonicalUrl,
          channelName: title,
          channelLogo: logo ?? null,
          channelGroup: group ?? null,
          durationMinutes: 120,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        recordingId?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : `HTTP ${res.status}`,
        );
      }
      setRecordingHint(
        body.recordingId
          ? `Recording started (${body.recordingId.slice(0, 8)}…).`
          : "Recording started.",
      );
    } catch (e) {
      setRecordingHint(e instanceof Error ? e.message : "Could not start recording.");
    } finally {
      setRecordingBusy(false);
    }
  }, [canonicalUrl, recordingId, isLivePlayback, title, logo, group]);

  if (
    ((sessionId || recordingId) && sessionLoading) ||
    legacyBridge === "working"
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center text-foreground-intense">
        <ZendeLoadingState
          size="large"
          label="Preparing playback…"
          description="Opening the secure stream session"
        />
      </div>
    );
  }

  if (sessionMetaError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-8 text-center text-foreground-intense">
        <p className="text-[17px] text-foreground-intense">{sessionMetaError}</p>
        <Link
          href="/library"
          className={buttonVariants({ variant: "secondary", size: "lg" })}
        >
          Back to Library
        </Link>
      </div>
    );
  }

  if (!playbackSrc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-8 text-center text-foreground-intense">
        <p className="text-[17px] text-foreground-intense">No stream was selected.</p>
        <Link
          href="/"
          className={buttonVariants({ variant: "secondary", size: "lg" })}
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <BrowseShellRefContext.Provider value={containerRef}>
      <div
        ref={containerRef}
        className="fixed inset-0 z-0 overflow-hidden bg-background text-foreground-intense"
      >
        {resumePrompt ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
            <Card frame="solid" className="max-w-xs text-center">
              <div className="px-5 py-6">
                <p className="text-[14px] font-semibold text-foreground-intense">Resume playback?</p>
                <p className="mt-2 text-[13px] text-foreground-muted">Continue from {formatClock(resumePrompt.saved)}?</p>
                <div className="mt-6 flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => handleResumeChoice("start-over")}>Start over</Button>
                  <Button className="flex-1" onClick={() => handleResumeChoice("continue")}>Continue ({resumePrompt.timeLeft}s)</Button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 z-0"
            onClick={() => {
              if (isVodPlayback) {
                remoteAwareTogglePlay();
                return;
              }
              const v = videoRef.current;
              if (v?.paused) {
                void v.play()
                  .then(() => setAutoplayBlocked(false))
                  .catch(() => setAutoplayBlocked(true));
              }
            }}
          >
          <StreamPlayer
            key={`${playbackSrc}-${playerRetryEpoch}`}
            ref={videoRef}
            src={playbackSrc}
            playbackMode={sessionMeta?.playbackMode}
            controls={false}
            onSessionChange={setPlayerSession}
            onError={(err) => {
              console.warn("[player] hls error", err);
              if (err.fatal) setPlayerFatalError(err);
            }}
            className="absolute inset-0 h-full w-full object-contain"
          />
          </div>

          {autoplayBlocked && !playerFatalError ? (
            <Button variant="ghost"
              type="button"
              onClick={() => togglePlay()}
              className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center outline-none"
              aria-label="Tap to play"
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-background-muted ring-1 ring-border">
                <Play className="size-8 pl-1 text-foreground-intense" fill="currentColor" aria-hidden />
              </span>
              <span className="text-[16px] font-semibold text-foreground-intense">Tap to play</span>
            </Button>
          ) : null}

          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300",
              buffering && !playerFatalError ? "opacity-100" : "opacity-0",
            )}
          >
            <Card frame="solid" className="pointer-events-none">
              <div className="flex items-center gap-3 px-5 py-3">
                <ZendeSpinner size="large" label="Buffering stream" />
                <div className="text-left">
                  <p className="text-[14px] font-semibold text-foreground-intense">
                    Buffering
                  </p>
                  <p className="text-[12px] text-foreground-intense">
                    Network or stream is catching up
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {playerFatalError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background px-4">
              <Card frame="solid" className="max-w-sm">
                <div className="px-5 py-4 text-left">
                  <p className="text-[14px] font-semibold text-error-strong">
                    Playback failed
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed text-foreground-intense">
                    This stream could not be played. It may be offline, blocked in
                    your browser, or use an unsupported format.
                  </p>
                  <details className="mt-2 text-[12px] text-foreground-intense">
                    <summary className="cursor-pointer select-none">Technical details</summary>
                    <p className="mt-1 break-all font-mono">
                      {playerFatalError.details}
                      {playerFatalError.reason ? ` — ${playerFatalError.reason}` : ""}
                    </p>
                  </details>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        setPlayerFatalError(null);
                        setPlayerRetryEpoch((n) => n + 1);
                      }}
                      size="sm"
                    >
                      Retry
                    </Button>
                    <Button
                      type="button"
                      onClick={() => router.replace(getWatchReturnHref())}
                      size="sm"
                    >
                      Go back
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {infoOpen ? (
            <div className="absolute inset-0 z-[35] flex items-center justify-center bg-background px-4">
              <Card frame="solid" className="max-w-md w-full">
                <div className="px-5 py-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground-intense">
                        Now playing
                      </p>
                      <h2 className="mt-1 truncate text-[18px] font-semibold text-foreground-intense">
                        {titleDisplay}
                      </h2>
                      {group ? (
                        <p className="mt-1 truncate text-[13px] text-foreground-intense">{group}</p>
                      ) : null}
                    </div>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => setInfoOpen(false)}
                      className="rounded-lg px-2 py-1 text-[13px] text-foreground-intense hover:bg-background-muted"
                    >
                      Esc
                    </Button>
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-background px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-intense">
                      Channel zap
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["frequent", "favorites", "group"] as const).map((mode) => (
                        <Button variant="ghost"
                          key={mode}
                          type="button"
                          onClick={() => setZapMode(mode)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-[13px] font-semibold outline-none",
                            zapMode === mode
                              ? "bg-background-muted text-foreground-inverse"
                              : "border border-border text-foreground-intense hover:bg-background-muted",
                          )}
                        >
                          {ZAP_MODE_LABELS[mode]}
                        </Button>
                      ))}
                    </div>
                    <p className="mt-2 text-[12px] text-foreground-intense">
                      ↑↓ or Channel ± to change channel · Shift+Z cycles mode
                    </p>
                  </div>

                  {isLivePlayback && !recordingId ? (
                    <Button variant="ghost"
                      type="button"
                      disabled={recordingBusy}
                      onClick={() => void startRecording()}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-error-subtle px-4 py-3 text-[15px] font-semibold text-foreground-intense outline-none hover:bg-error-subtle disabled:opacity-50"
                    >
                      <Circle className="size-4 fill-current" aria-hidden />
                      {recordingBusy ? <><ZendeSpinner size="tiny" label="Starting recording" /> Starting…</> : "Record 2 hours"}
                    </Button>
                  ) : null}
                  {recordingHint ? (
                    <p className="mt-2 text-[13px] text-success-strong">{recordingHint}</p>
                  ) : null}
                </div>
              </Card>
            </div>
          ) : null}

          <div
            inert={!chromeVisible ? true : undefined}
            className={cn(
              "absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 transition-opacity duration-300 ease-out motion-reduce:transition-none",
              "bg-gradient-to-b from-background via-background to-transparent",
              "p-3 pb-10 pt-[max(0.65rem,env(safe-area-inset-top))]",
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
              <h1 className="truncate text-[14px] font-semibold tracking-tight sm:text-[15px]">
                    {titleDisplay}
                  </h1>
                  {titleResolutionBadge ? (
                    <ChannelResolutionBadge
                      label={titleResolutionBadge}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
                {isRecordedPlayback ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary-strong">
                    Recorded
                  </span>
                ) : isVodPlayback ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary-strong">
                    VOD
                  </span>
                ) : isLivePlayback ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-success-strong">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-subtle opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success-subtle" />
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
              <GlassIconButton
                aria-label="Stream info"
                onClick={() => setInfoOpen((open) => !open)}
                className="shrink-0"
              >
                <Info className="h-4 w-4" />
              </GlassIconButton>
            </div>
            <Link
              href="/library"
              className={cn(
                "pointer-events-auto hidden min-h-9 shrink-0 items-center rounded-full px-2.5 py-1.5 text-[13px] font-medium sm:flex",
                "text-foreground-intense outline-none hover:bg-background-muted hover:text-foreground-intense focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              Library
            </Link>
          </div>

        <div
          inert={!chromeVisible ? true : undefined}
          className={cn(
            "absolute inset-x-0 bottom-0 z-30 w-full transition-opacity duration-300 ease-out motion-reduce:transition-none",
            chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onMouseEnter={onChromePointerEnter}
          onMouseLeave={onChromePointerLeave}
        >
          <div className="mx-auto flex w-full max-w-[min(100vw,1920px)] flex-col gap-1.5 px-2 sm:px-3">
            {isLivePlayback &&
            ringPeekClientReady &&
            ringNavAvailable &&
            prevEntry &&
            nextEntry ? (
              <div className="pointer-events-auto relative z-[1]">
                <FrequentChannelPeek
                  ring={channelRing}
                  streamUrl={canonicalUrl}
                  nowTitle={title}
                  nowLogo={logo}
                  nowGroup={group}
                  onJumpChannel={jumpToRingChannel}
                />
              </div>
            ) : null}

            <div
              className={cn(
                "relative w-full overflow-hidden rounded-t-[20px] rounded-b-none border-x-0 border-b-0",
                "border border-border border-b-transparent bg-background",
                "shadow-lg backdrop-blur-xl ring-1 ring-border",
              )}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
                aria-hidden
              />
              <div className="px-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 sm:px-3">
                {playbackMeta?.contentKind === "episode" && playbackMeta.seriesId ? (
                  <EpisodePlaybackControls
                    playback={playbackMeta}
                    logo={logo}
                    group={group}
                    disabled={Boolean(playerFatalError)}
                  />
                ) : null}

                <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] tabular-nums text-foreground-intense">
                  {isLivePlayback ? (
                    <span className="inline-flex items-center gap-1.5 font-medium uppercase tracking-wide text-success-strong">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-subtle opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success-subtle" />
                      </span>
                      Live
                    </span>
                  ) : isRecordedPlayback ? (
                    <span className="font-medium uppercase tracking-wide text-primary-strong">
                      Recorded
                    </span>
                  ) : (
                    <span>{formatClock(currentTime)}</span>
                  )}
                  <div className="flex items-center gap-1.5">
                    {isVodPlayback ? (
                      <Button variant="ghost"
                        type="button"
                        onClick={() => remoteAwareSeekTo(0)}
                        className="rounded-full border border-border bg-background-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-intense hover:bg-background-muted"
                      >
                        Start over
                      </Button>
                    ) : null}
                    <span className="text-foreground-intense">
                      {isVodPlayback
                        ? formatClock(effectiveDuration)
                        : isLivePlayback
                          ? "Buffering"
                          : ""}
                    </span>
                  </div>
                </div>

                {seekRatio !== null ? (
                  <SeekBar
                    ratio={seekRatio}
                    bufferRatio={bufferRatio}
                    onSeek={(clientX, rect) => {
                      if (remoteControlActiveState && effectiveDuration > 0) {
                        const x = Math.min(Math.max(clientX, rect.left), rect.right);
                        const ratio = (x - rect.left) / rect.width;
                        remoteAwareSeekTo(ratio * effectiveDuration);
                        return;
                      }
                      onSeek(clientX, rect);
                    }}
                    disabled={!Number.isFinite(effectiveDuration) || effectiveDuration <= 0}
                  />
                ) : (
                  <LiveBufferBar bufferRatio={bufferRatio} />
                )}

                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="flex shrink-0 items-center gap-1">
                    {isVodPlayback ? (
                      <GlassIconButton
                        aria-label="Back 15 seconds"
                        onClick={() => remoteAwareSkipSeconds(-15)}
                      >
                        <Rewind className="h-4 w-4" />
                      </GlassIconButton>
                    ) : null}

                    <GlassPrimaryButton
                      aria-label={playing ? "Pause" : "Play"}
                      onClick={remoteAwareTogglePlay}
                    >
                      {playing ? (
                        <Pause className="h-4 w-4" fill="currentColor" />
                      ) : (
                        <Play className="h-4 w-4 pl-0.5" fill="currentColor" />
                      )}
                    </GlassPrimaryButton>

                    {isVodPlayback ? (
                      <GlassIconButton
                        aria-label="Forward 15 seconds"
                        onClick={() => remoteAwareSkipSeconds(15)}
                      >
                        <FastForward className="h-4 w-4" />
                      </GlassIconButton>
                    ) : null}
                  </div>

                  <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <DropdownMenu modal={false}>
                    <GlassIconMenuTrigger
                      aria-label="Playback speed"
                      disabled={!isVodPlayback}
                    >
                      <Gauge className="h-4 w-4" />
                    </GlassIconMenuTrigger>
                    <>
                      <DropdownMenuContent
                        side="top"
                        align="end"
                        sideOffset={10}
                        className="z-[100]"
                      >
                        <div className="min-w-[140px] origin-bottom rounded-2xl border border-border bg-background p-1 shadow-2xl outline-none">
                          <div>
                            <DropdownMenuGroup>
                              <DropdownMenuGroupLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-intense">
                                Speed
                              </DropdownMenuGroupLabel>
                              {PLAYBACK_SPEEDS.map((r) => (
                                <DropdownMenuItem
                                  key={r}
                                  className={cn(
                                    "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] text-foreground-intense outline-none",
                                    "data-[highlighted]:bg-background-muted",
                                  )}
                                  onClick={() => applySpeed(r)}
                                >
                                  {r === 1 ? "Normal" : `${r}×`}
                                  {playbackRate === r ? (
                                    <span className="text-success-strong">✓</span>
                                  ) : null}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                          </div>
                        </div>
                      </DropdownMenuContent>
                    </>
                  </DropdownMenu>

                  <DropdownMenu modal={false}>
                    <GlassIconMenuTrigger
                      aria-label="Quality"
                      disabled={!qualityEnabled}
                    >
                      <span className="max-w-[3.25rem] truncate text-[12px] font-semibold tabular-nums">
                        {qualityLabelShort}
                      </span>
                    </GlassIconMenuTrigger>
                    <>
                      <DropdownMenuContent
                        side="top"
                        align="end"
                        sideOffset={10}
                        className="z-[100]"
                      >
                        <div className="min-w-[180px] origin-bottom rounded-2xl border border-border bg-background p-1 shadow-2xl outline-none">
                          <div>
                            <DropdownMenuGroup>
                              <DropdownMenuGroupLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-intense">
                                Quality
                              </DropdownMenuGroupLabel>
                              {qualityOptions.length === 0 ? (
                                <p className="px-3 py-2 text-[13px] text-foreground-intense">
                                  {playerSession?.isNativeHls
                                    ? "Use Safari native HLS (no manual ladder)."
                                    : "Single track or not loaded yet."}
                                </p>
                              ) : (
                                qualityOptions.map((q) => (
                                  <DropdownMenuItem
                                    key={q.index}
                                    className={cn(
                                      "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] text-foreground-intense outline-none",
                                      "data-[highlighted]:bg-background-muted",
                                    )}
                                    onClick={() =>
                                      playerSession?.setQualityLevel(q.index)
                                    }
                                  >
                                    {q.label}
                                    {currentLoadLevel === q.index ? (
                                      <span className="text-success-strong">✓</span>
                                    ) : null}
                                  </DropdownMenuItem>
                                ))
                              )}
                            </DropdownMenuGroup>
                          </div>
                        </div>
                      </DropdownMenuContent>
                    </>
                  </DropdownMenu>

                  {audioTracks.length > 1 ? (
                    <DropdownMenu modal={false}>
                      <GlassIconMenuTrigger aria-label="Audio track">
                        <Languages className="h-4 w-4" />
                      </GlassIconMenuTrigger>
                      <>
                        <DropdownMenuContent side="top" align="end" sideOffset={10} className="z-[100]">
                          <div className="min-w-[180px] origin-bottom rounded-2xl border border-border bg-background p-1 shadow-2xl outline-none">
                            <div>
                              <DropdownMenuGroup>
                                <DropdownMenuGroupLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-intense">
                                  Audio
                                </DropdownMenuGroupLabel>
                                {audioTracks.map((t) => (
                                  <DropdownMenuItem
                                    key={t.index}
                                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] text-foreground-intense outline-none data-[highlighted]:bg-background-muted"
                                    onClick={() => playerSession?.setAudioTrack(t.index)}
                                  >
                                    {t.label}
                                    {currentAudioTrack === t.index ? (
                                      <span className="text-success-strong">✓</span>
                                    ) : null}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuGroup>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </>
                    </DropdownMenu>
                  ) : null}

                  {showSubtitleControls ? (
                    <DropdownMenu modal={false}>
                      <GlassIconMenuTrigger aria-label="Subtitles">
                        <Subtitles className="h-4 w-4" />
                      </GlassIconMenuTrigger>
                      <>
                        <DropdownMenuContent side="top" align="end" sideOffset={10} className="z-[100]">
                          <div className="min-w-[220px] origin-bottom rounded-2xl border border-border bg-background p-1 shadow-2xl outline-none">
                            <div>
                              <DropdownMenuGroup>
                                <DropdownMenuGroupLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-intense">
                                  Subtitles
                                </DropdownMenuGroupLabel>
                                <DropdownMenuItem
                                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] text-foreground-intense outline-none data-[highlighted]:bg-background-muted"
                                  onClick={() => {
                                    handleBuiltinSubtitle(-1);
                                    externalSubtitles.markOff();
                                  }}
                                >
                                  Off
                                  {currentSubtitleTrack < 0 &&
                                  !externalSubtitles.activeTrackId ? (
                                    <span className="text-success-strong">✓</span>
                                  ) : null}
                                </DropdownMenuItem>
                                {hasBuiltinSubtitles
                                  ? subtitleTracks
                                      .filter((track) => track.index >= 0)
                                      .map((track) => (
                                        <DropdownMenuItem
                                          key={`builtin-${track.index}`}
                                          className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] text-foreground-intense outline-none data-[highlighted]:bg-background-muted"
                                          onClick={() => handleBuiltinSubtitle(track.index)}
                                        >
                                          {track.label}
                                          {currentSubtitleTrack === track.index &&
                                          externalSubtitles.activeSource !== "external" ? (
                                            <span className="text-success-strong">✓</span>
                                          ) : null}
                                        </DropdownMenuItem>
                                      ))
                                  : null}
                                {externalSubtitles.tracks.map((track) => (
                                  <DropdownMenuItem
                                    key={`external-${track.id}`}
                                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] text-foreground-intense outline-none data-[highlighted]:bg-background-muted"
                                    onClick={() => handleExternalSubtitle(track.id)}
                                  >
                                    {track.label}
                                    {externalSubtitles.activeTrackId === track.id ? (
                                      <span className="text-success-strong">✓</span>
                                    ) : null}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuItem
                                  className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background-muted px-3 py-2.5 text-[14px] font-medium text-primary-strong outline-none data-[highlighted]:bg-background-muted"
                                  onClick={() => setSubtitleSearchOpen(true)}
                                >
                                  <Search className="size-4" aria-hidden />
                                  Search online…
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </>
                    </DropdownMenu>
                  ) : null}

                  <div className="hidden items-center gap-1.5 sm:flex">
                    <span className="text-[11px] text-foreground-intense">Vol</span>
                    <Slider
                      aria-label="Volume"
                      min={0}
                      max={1}
                      step={0.02}
                      value={[volume]}
                      onValueChange={(value) => setVol(Array.isArray(value) ? (value[0] ?? 0) : value)}
                      tooltipVisibility="never"
                      className="w-20"
                    />
                  </div>

                  <GlassIconButton
                    aria-label={muted ? "Unmute" : "Mute"}
                    onClick={toggleMute}
                  >
                    {muted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </GlassIconButton>

                  {pipCapable ? (
                    <GlassIconButton
                      aria-label={
                        pipActive
                          ? "Exit picture in picture"
                          : "Picture in picture"
                      }
                      onClick={() => void togglePip()}
                      className={pipActive ? "border-primary bg-primary" : undefined}
                    >
                      <PictureInPicture className="h-4 w-4" />
                    </GlassIconButton>
                  ) : null}

                  <GlassIconButton
                    aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
                    onClick={toggleFullscreen}
                  >
                    {fs ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </GlassIconButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      {isVodPlayback ? (
        <SubtitleSearchPanel
          open={subtitleSearchOpen}
          onClose={() => setSubtitleSearchOpen(false)}
          title={title}
          playback={playbackMeta}
          onSelect={(track) => {
            externalSubtitles.addTrack(track);
          }}
        />
      ) : null}
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
    <Button variant="ghost"
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 rounded-full border border-border bg-background px-2.5 py-1.5 text-[13px] font-semibold text-foreground-intense outline-none backdrop-blur-xl",
        "transition-colors hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      {children}
    </Button>
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
    <Button variant="ghost"
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-background text-foreground-intense outline-none transition-colors sm:h-10 sm:min-w-10",
        "hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:cursor-not-allowed disabled:opacity-35",
        className,
      )}
    >
      {children}
    </Button>
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
    <Button variant="ghost"
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground outline-none sm:h-11 sm:min-w-11",
        "shadow-lg focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      {children}
    </Button>
  );
}

/** Appica menu trigger shared by the player controls. */
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
    <DropdownMenuTrigger
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-background text-foreground-intense outline-none sm:h-10 sm:min-w-10",
        "hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:cursor-not-allowed disabled:opacity-35",
        "data-[popup-open]:bg-background-muted",
        className,
      )}
    >
      {children}
    </DropdownMenuTrigger>
  );
}

function LiveBufferBar({ bufferRatio }: { bufferRatio: number }) {
  return (
    <div
      className="relative mb-2 h-2 w-full overflow-hidden rounded-full border border-border bg-background-muted"
      aria-hidden
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-white/20 transition-[width] duration-300"
        style={{ width: `${Math.min(100, bufferRatio * 100 || 8)}%` }}
      />
      <div className="absolute inset-y-0 left-0 w-10 rounded-full bg-primary" />
    </div>
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
        "group relative mb-2 h-2 w-full cursor-pointer overflow-hidden rounded-full border border-border bg-background-muted",
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
        className="absolute inset-y-0 left-0 bg-white/20"
        style={{ width: `${Math.min(100, bufferRatio * 100)}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-primary"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
