"use client";

import type { HlsConfig } from "hls.js";
import type Hls from "hls.js";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Ref,
} from "react";

import { getStreamHlsConfig } from "@/lib/player/hls-live-config";
import {
  collectPlaybackTelemetry,
  streamSessionIdFromUrl,
} from "@/lib/player/playback-telemetry";
import { progressiveCompatibilityUrl } from "@/lib/player/progressive-compatibility";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import type { PlaybackMode } from "@/lib/stream/playback-url";
import { isTvEnvironment } from "@/lib/tv/tv-environment";
import { cn } from "@/lib/utils";

/**
 * iPhone/iPad: prefer Safari's native HLS. hls.js ManagedMediaSource on iOS 17.1+
 * sets disableRemotePlayback and breaks Picture-in-Picture / AirPlay.
 */
function prefersNativeAppleHls(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  // iPadOS 13+ may report as MacIntel with touch
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
}

export type QualityOption = { index: number; label: string };
export type MediaTrackOption = { index: number; label: string };

export type PlayerSession = {
  video: HTMLVideoElement;
  hls: Hls | null;
  isNativeHls: boolean;
  getQualityOptions(): QualityOption[];
  setQualityLevel(levelIndex: number): void;
  getAudioTracks(): MediaTrackOption[];
  setAudioTrack(index: number): void;
  getSubtitleTracks(): MediaTrackOption[];
  setSubtitleTrack(index: number): void;
};

export type PlayerError = {
  type: string;
  details: string;
  fatal: boolean;
  reason?: string;
};

type Props = {
  ref?: Ref<HTMLVideoElement>;
  src: string;
  className?: string;
  /** Native HTML5 controls — prefer custom chrome on watch. */
  controls?: boolean;
  /** Invoked after each attach (and when manifest / levels change). Pass `null` on teardown. */
  onSessionChange?: (session: PlayerSession | null) => void;
  /** Invoked when hls.js fires an error — fatal errors mean hls.js has stopped. */
  onError?: (err: PlayerError) => void;
  /** Optional extra HLS options merged after defaults (advanced). */
  hlsConfig?: Partial<HlsConfig>;
  /** When set, overrides URL heuristics for HLS vs native progressive. */
  playbackMode?: PlaybackMode;
};

function shouldUseHls(src: string, playbackMode?: PlaybackMode): boolean {
  if (playbackMode === "mpegts" || playbackMode === "progressive") return false;
  if (playbackMode === "hls") return true;
  return looksLikeHls(src);
}

function looksLikeHls(url: string): boolean {
  return (
    /\.m3u8([?#]|$)/i.test(url) ||
    url.includes("format=m3u8") ||
    (url.includes("/api/stream/proxy/") && !/\.(mp4|webm|mkv)(\?|$)/i.test(url))
  );
}

function createClientPlaybackId(): string {
  try {
    return crypto.randomUUID().replaceAll("-", "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

function playbackSurface(): "tv" | "mobile" | "desktop" | "unknown" {
  if (isTvEnvironment()) return "tv";
  if (typeof window === "undefined") return "unknown";
  return window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
}

function safeResourcePath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return `${url.pathname}${url.search}`.slice(0, 500);
  } catch {
    return value.slice(0, 500);
  }
}

function parseHeightFromResolution(res?: string): number | undefined {
  if (!res) return undefined;
  const m = /(\d+)\s*x\s*(\d+)/.exec(res);
  return m ? parseInt(m[2]!, 10) : undefined;
}

function nativeTextTracks(video: HTMLVideoElement): MediaTrackOption[] {
  const tracks = video.textTracks;
  const out: MediaTrackOption[] = [{ index: -1, label: "Off" }];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    const label = t.label || t.language || `Subtitle ${i + 1}`;
    out.push({ index: i, label });
  }
  return out;
}

function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

type MpegTsPlayer = {
  attachMediaElement(media: HTMLMediaElement): void;
  detachMediaElement(): void;
  load(): void;
  unload(): void;
  play(): Promise<void>;
  destroy(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

type CompatibilityFallback = {
  source: string;
  url: string;
};

const COMPATIBILITY_TRANSCODE_HLS_CONFIG: Partial<HlsConfig> = {
  startPosition: 0,
  liveMaxLatencyDurationCount: Infinity,
  maxLiveSyncPlaybackRate: 1,
  // VOD segments have deliberate A/V timestamps. Extending short video tracks
  // duplicates their final frame and is only useful for malformed live IPTV.
  stretchShortVideoTrack: false,
  forceKeyFrameOnDiscontinuity: false,
};

export function StreamPlayer(
    {
      ref,
      src,
      className,
      controls = true,
      onSessionChange,
      onError,
      hlsConfig: hlsConfigExtra,
      playbackMode,
    }: Props,
  ) {
    const innerRef = useRef<HTMLVideoElement>(null);
    const [compatibilityFallback, setCompatibilityFallback] =
      useState<CompatibilityFallback | null>(null);
    const usesCompatibilityFallback =
      playbackMode === "progressive" && compatibilityFallback?.source === src;
    const activeSrc = usesCompatibilityFallback
      ? compatibilityFallback.url
      : src;
    const activePlaybackMode = usesCompatibilityFallback ? "hls" : playbackMode;
    const setRef = useCallback((node: HTMLVideoElement | null) => {
      innerRef.current = node;
    }, []);

    const onSessionChangeRef = useRef(onSessionChange);
    useEffect(() => {
      onSessionChangeRef.current = onSessionChange;
    });

    const onErrorRef = useRef(onError);
    useEffect(() => {
      onErrorRef.current = onError;
    });

    useEffect(() => {
      const video = innerRef.current;
      if (!video) return;
      // Safari AirPlay / PiP hint (attribute, not a React prop).
      video.setAttribute("x-webkit-airplay", "allow");
      video.disablePictureInPicture = false;
      video.disableRemotePlayback = false;
    }, [activeSrc]);

    useEffect(() => {
      const video = innerRef.current;
      if (!video || !activeSrc) return;

      let hls: Hls | null = null;
      let mpegtsPlayer: MpegTsPlayer | null = null;
      let HlsModule: typeof import("hls.js").default | null = null;
      let networkRetryTimer: ReturnType<typeof setTimeout> | null = null;
      let mediaHardResetTimer: ReturnType<typeof setTimeout> | null = null;
      let nativeErrorListener: (() => void) | null = null;
      let hlsRecreateAttempt = 0;
      const hlsMode = shouldUseHls(activeSrc, activePlaybackMode);
      const mpegtsMode = activePlaybackMode === "mpegts";
      let isNativeHls = false;
      let cancelled = false;
      const streamSessionId = streamSessionIdFromUrl(activeSrc);
      const clientPlaybackId = createClientPlaybackId();
      const surface = playbackSurface();
      const telemetryStartedAt = performance.now();
      const recentEvents: Array<{
        atMs: number;
        event: string;
        details?: Record<string, unknown>;
      }> = [];
      let waitingStartedAt: number | null = null;
      let waitingReportTimer: ReturnType<typeof setInterval> | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let hlsLoadStoppedForPause = false;
      let hlsIsLive = false;

      const recordPlaybackEvent = (
        event: string,
        details?: Record<string, unknown>,
      ) => {
        recentEvents.push({
          atMs: Math.max(0, Math.round(performance.now() - telemetryStartedAt)),
          event,
          ...(details ? { details } : {}),
        });
        if (recentEvents.length > 40) recentEvents.splice(0, recentEvents.length - 40);
      };

      const reportPlaybackEvent = (
        event: string,
        context?: Record<string, unknown>,
      ) => {
        if (!streamSessionId || cancelled) return;
        recordPlaybackEvent(event, context);
        const mediaError = video.error;
        const stallDurationMs = waitingStartedAt === null
          ? undefined
          : Math.max(0, Math.round(performance.now() - waitingStartedAt));
        void zendeFetch("/api/stream/client-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schemaVersion: 1,
            sessionId: streamSessionId,
            clientPlaybackId,
            event,
            surface,
            currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
            readyState: video.readyState,
            networkState: video.networkState,
            paused: video.paused,
            ...(stallDurationMs !== undefined ? { stallDurationMs } : {}),
            ...(mediaError?.code ? { errorCode: mediaError.code } : {}),
            ...(mediaError?.message
              ? { errorMessage: mediaError.message }
              : typeof context?.errorMessage === "string"
                ? { errorMessage: context.errorMessage.slice(0, 500) }
                : {}),
            ...(typeof context?.errorType === "string"
              ? { errorType: context.errorType }
              : {}),
            ...(typeof context?.errorDetails === "string"
              ? { errorDetails: context.errorDetails }
              : {}),
            ...(typeof context?.fatal === "boolean" ? { fatal: context.fatal } : {}),
            ...(context ? { context } : {}),
            snapshot: collectPlaybackTelemetry(video, hls),
            recentEvents,
          }),
          keepalive: true,
        }).catch(() => undefined);
      };

      const clearWaitingReporter = () => {
        if (waitingReportTimer) {
          clearInterval(waitingReportTimer);
          waitingReportTimer = null;
        }
      };

      const beginWaiting = (event: "waiting" | "stalled") => {
        if (waitingStartedAt === null) waitingStartedAt = performance.now();
        reportPlaybackEvent(event);
        if (!waitingReportTimer) {
          waitingReportTimer = setInterval(() => {
            reportPlaybackEvent("waiting-update");
          }, 5_000);
        }
      };

      const finishWaiting = () => {
        if (waitingStartedAt === null) {
          recordPlaybackEvent("playing");
          return;
        }
        const stallDurationMs = Math.max(
          0,
          Math.round(performance.now() - waitingStartedAt),
        );
        reportPlaybackEvent("recovered", { stallDurationMs });
        waitingStartedAt = null;
        clearWaitingReporter();
      };

      const telemetryListeners: Record<string, () => void> = {
        loadedmetadata: () => recordPlaybackEvent("loadedmetadata"),
        loadeddata: () => recordPlaybackEvent("loadeddata"),
        canplay: () => recordPlaybackEvent("canplay"),
        playing: finishWaiting,
        waiting: () => beginWaiting("waiting"),
        stalled: () => beginWaiting("stalled"),
        seeking: () => recordPlaybackEvent("seeking"),
        seeked: () => recordPlaybackEvent("seeked"),
        pause: () => recordPlaybackEvent("pause"),
        ended: () => reportPlaybackEvent("ended"),
        suspend: () => recordPlaybackEvent("suspend"),
        durationchange: () => recordPlaybackEvent("durationchange"),
        error: () => reportPlaybackEvent("error"),
        abort: () => reportPlaybackEvent("abort"),
      };

      // hls.js continues refreshing a live playlist after the media element is
      // paused. On single-connection IPTV accounts that invisible traffic can
      // steal the upstream slot from a TV that is actively playing. Suspend
      // network loading with the media element, then restart at the live edge
      // (or the current VOD position) when playback resumes.
      const suspendHlsLoadWhilePaused = () => {
        if (!hls || video.ended || hlsLoadStoppedForPause) return;
        hls.stopLoad();
        hlsLoadStoppedForPause = true;
        recordPlaybackEvent("hls-load-suspended", { reason: "media-paused" });
      };
      const resumeHlsLoadForPlayback = () => {
        if (!hls || !hlsLoadStoppedForPause) return;
        hlsLoadStoppedForPause = false;
        hls.startLoad(hlsIsLive ? -1 : Math.max(0, video.currentTime));
        recordPlaybackEvent("hls-load-resumed", {
          live: hlsIsLive,
          startPosition: hlsIsLive ? "live-edge" : video.currentTime,
        });
      };
      video.addEventListener("pause", suspendHlsLoadWhilePaused);
      video.addEventListener("play", resumeHlsLoadForPlayback);

      if (streamSessionId) {
        for (const [event, listener] of Object.entries(telemetryListeners)) {
          video.addEventListener(event, listener);
        }
        queueMicrotask(() => reportPlaybackEvent("session-start", {
          hlsMode,
          mpegtsMode,
          playbackMode: activePlaybackMode ?? "auto",
          compatibilityFallback: usesCompatibilityFallback,
        }));
        heartbeatTimer = setInterval(() => {
          reportPlaybackEvent("heartbeat");
        }, 30_000);
      }

      const bumpSession = () => {
        onSessionChangeRef.current?.(buildSession());
      };

      const buildSession = (): PlayerSession => ({
        video,
        hls,
        isNativeHls,
        getQualityOptions(): QualityOption[] {
          if (!hls?.levels?.length) return [];
          const opts: QualityOption[] = [{ index: -1, label: "Auto" }];
          for (let i = 0; i < hls.levels.length; i++) {
            const L = hls.levels[i]!;
            const fromAttrs = parseHeightFromResolution(L.attrs?.RESOLUTION);
            const h = L.height || fromAttrs;
            const label = h
              ? `${h}p`
              : L.bitrate
                ? `${Math.round(L.bitrate / 1000)} kb/s`
                : `Track ${i + 1}`;
            opts.push({ index: i, label });
          }
          return opts;
        },
        setQualityLevel(levelIndex: number) {
          if (!hls) return;
          hls.loadLevel = levelIndex;
        },
        getAudioTracks(): MediaTrackOption[] {
          if (hls?.audioTracks?.length) {
            return hls.audioTracks.map((t, i) => ({
              index: i,
              label: t.name || t.lang || `Audio ${i + 1}`,
            }));
          }
          return [];
        },
        setAudioTrack(index: number) {
          if (!hls?.audioTracks?.length) return;
          hls.audioTrack = index;
          bumpSession();
        },
        getSubtitleTracks(): MediaTrackOption[] {
          if (hls?.subtitleTracks?.length) {
            return [
              { index: -1, label: "Off" },
              ...hls.subtitleTracks.map((t, i) => ({
                index: i,
                label: t.name || t.lang || `Subtitle ${i + 1}`,
              })),
            ];
          }
          return nativeTextTracks(video);
        },
        setSubtitleTrack(index: number) {
          if (hls?.subtitleTracks?.length) {
            hls.subtitleTrack = index;
            bumpSession();
            return;
          }
          for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i]!.mode = i === index ? "showing" : "disabled";
          }
          bumpSession();
        },
      });

      const clearMediaHardResetTimer = () => {
        if (mediaHardResetTimer) {
          clearTimeout(mediaHardResetTimer);
          mediaHardResetTimer = null;
        }
      };

      const startPlayback = () => {
        if (cancelled) return;

        if (mpegtsMode && mpegtsPlayer) {
          mpegtsPlayer.attachMediaElement(video);
          mpegtsPlayer.load();
          void mpegtsPlayer.play().catch(() => {
            video.dispatchEvent(new Event("pause"));
          });
          onSessionChangeRef.current?.(buildSession());
          return;
        }

        const canNativeHls =
          video.canPlayType("application/vnd.apple.mpegurl") !== "";
        // Native first on Apple mobile so PiP/AirPlay keep working.
        const useNativeHls = hlsMode && canNativeHls && prefersNativeAppleHls();
        const useHlsJs =
          hlsMode && Boolean(HlsModule?.isSupported()) && !useNativeHls;

        if (useHlsJs && HlsModule) {
          const HlsCtor = HlsModule;
          let mediaErrorStage = 0;
          let networkRetries = 0;

          if (networkRetryTimer) {
            clearTimeout(networkRetryTimer);
            networkRetryTimer = null;
          }
          clearMediaHardResetTimer();

          const resetMediaErrorStage = () => {
            mediaErrorStage = 0;
          };

          const hardResetMediaElement = (thenReloadSource: boolean) => {
            if (!hls || cancelled) return;
            clearMediaHardResetTimer();
            hls.stopLoad();
            hls.detachMedia();
            video.pause();
            video.removeAttribute("src");
            video.load();
            mediaHardResetTimer = setTimeout(() => {
              mediaHardResetTimer = null;
              if (cancelled || !hls) return;
              if (thenReloadSource) {
                hls.loadSource(activeSrc);
              }
              hls.attachMedia(video);
              hls.startLoad();
            }, 80);
          };

          const onManifestParsed = () => {
            resetMediaErrorStage();
            networkRetries = 0;
            hlsRecreateAttempt = 0;
            recordPlaybackEvent("hls-manifest-parsed", {
              levelCount: hls?.levels.length ?? 0,
            });
            bumpSession();
            void video.play().catch(() => {
              video.dispatchEvent(new Event("pause"));
            });
          };

          const isAudioCodecError = (details: string | undefined, reason?: string) => {
            if (
              details === HlsCtor.ErrorDetails.BUFFER_ADD_CODEC_ERROR ||
              details === HlsCtor.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR
            ) {
              return true;
            }
            if (details === HlsCtor.ErrorDetails.BUFFER_APPEND_ERROR) {
              const msg = (reason ?? "").toLowerCase();
              return msg.includes("audio sourcebuffer") || msg.includes("mp4a");
            }
            return false;
          };

          const destroyHlsInstance = () => {
            if (!hls || !HlsModule) return;
            hls.off(HlsModule.Events.ERROR);
            hls.off(HlsModule.Events.MANIFEST_PARSED);
            hls.off(HlsModule.Events.MANIFEST_LOADING);
            hls.off(HlsModule.Events.MANIFEST_LOADED);
            hls.off(HlsModule.Events.LEVEL_LOADING);
            hls.off(HlsModule.Events.LEVEL_LOADED);
            hls.off(HlsModule.Events.FRAG_LOADING);
            hls.off(HlsModule.Events.FRAG_LOADED);
            hls.off(HlsModule.Events.LEVEL_SWITCHED);
            hls.off(HlsModule.Events.FRAG_BUFFERED);
            hls.off(HlsModule.Events.AUDIO_TRACKS_UPDATED);
            hls.off(HlsModule.Events.SUBTITLE_TRACKS_UPDATED);
            hls.stopLoad();
            hls.destroy();
            hls = null;
          };

          const attachHlsInstance = (configOverrides?: Partial<HlsConfig>) => {
            if (!HlsModule || cancelled) return;
            destroyHlsInstance();
            mediaErrorStage = 0;
            hlsLoadStoppedForPause = false;
            hlsIsLive = false;
            hls = new HlsCtor({
              ...getStreamHlsConfig(),
              ...(usesCompatibilityFallback
                ? COMPATIBILITY_TRANSCODE_HLS_CONFIG
                : undefined),
              ...hlsConfigExtra,
              ...configOverrides,
            });
            hls.on(HlsCtor.Events.MANIFEST_PARSED, onManifestParsed);
            hls.on(HlsCtor.Events.MANIFEST_LOADING, () => {
              recordPlaybackEvent("hls-manifest-loading");
            });
            hls.on(HlsCtor.Events.MANIFEST_LOADED, (_event, data) => {
              recordPlaybackEvent("hls-manifest-loaded", {
                levelCount: data.levels?.length ?? 0,
                stats: {
                  loaded: data.stats?.loaded ?? null,
                  total: data.stats?.total ?? null,
                  loadingStart: data.stats?.loading?.start ?? null,
                  loadingEnd: data.stats?.loading?.end ?? null,
                },
              });
            });
            hls.on(HlsCtor.Events.LEVEL_LOADING, (_event, data) => {
              recordPlaybackEvent("hls-level-loading", { level: data.level });
            });
            hls.on(HlsCtor.Events.LEVEL_LOADED, (_event, data) => {
              hlsIsLive = Boolean(data.details?.live);
              recordPlaybackEvent("hls-level-loaded", {
                level: data.level,
                live: data.details?.live ?? null,
                age: data.details?.age ?? null,
                targetDuration: data.details?.targetduration ?? null,
                fragmentCount: data.details?.fragments?.length ?? 0,
                startSN: data.details?.startSN ?? null,
                endSN: data.details?.endSN ?? null,
              });
            });
            hls.on(HlsCtor.Events.FRAG_LOADING, (_event, data) => {
              recordPlaybackEvent("hls-frag-loading", {
                type: data.frag?.type ?? null,
                level: data.frag?.level ?? null,
                sn: data.frag?.sn ?? null,
              });
            });
            hls.on(HlsCtor.Events.FRAG_LOADED, (_event, data) => {
              recordPlaybackEvent("hls-frag-loaded", {
                type: data.frag?.type ?? null,
                level: data.frag?.level ?? null,
                sn: data.frag?.sn ?? null,
                loaded: data.frag?.stats?.loaded ?? null,
                total: data.frag?.stats?.total ?? null,
                loadingStart: data.frag?.stats?.loading?.start ?? null,
                loadingEnd: data.frag?.stats?.loading?.end ?? null,
              });
            });
            hls.on(HlsCtor.Events.LEVEL_SWITCHED, bumpSession);
            hls.on(HlsCtor.Events.FRAG_BUFFERED, (_event, data) => {
              resetMediaErrorStage();
              networkRetries = 0;
              recordPlaybackEvent("hls-frag-buffered", {
                type: data.frag?.type ?? null,
                level: data.frag?.level ?? null,
                sn: data.frag?.sn ?? null,
              });
            });
            hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, bumpSession);
            hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, bumpSession);
            hls.on(HlsCtor.Events.ERROR, onHlsError);
            hls.loadSource(activeSrc);
            hls.attachMedia(video);
            onSessionChangeRef.current?.(buildSession());
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const onHlsError = (_evt: string, data: any) => {
            const err: PlayerError = {
              type: String(data.type ?? ""),
              details: String(data.details ?? ""),
              fatal: Boolean(data.fatal),
              reason: data.error?.message ?? data.reason ?? undefined,
            };
            console.error(
              "[hls.js]",
              err.type,
              err.details,
              err.fatal ? "(FATAL)" : "",
              err.reason ?? "",
            );
            reportPlaybackEvent("hls-error", {
              errorType: err.type,
              errorDetails: err.details,
              fatal: err.fatal,
              responseCode: data.response?.code ?? data.response?.status ?? null,
              responseText: String(
                data.response?.text ?? data.response?.statusText ?? "",
              ).slice(0, 300),
              resource: safeResourcePath(
                data.url ?? data.response?.url ?? data.frag?.url,
              ),
              frag: data.frag
                ? {
                    type: data.frag.type ?? null,
                    level: data.frag.level ?? null,
                    sn: data.frag.sn ?? null,
                  }
                : null,
              ...(err.reason ? { errorMessage: err.reason } : {}),
            });

            if (!data.fatal) {
              onErrorRef.current?.(err);
              return;
            }

            if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
              const details = data.details as string | undefined;
              const reason = err.reason;
              const appendWithVideoError =
                (details === HlsCtor.ErrorDetails.BUFFER_APPEND_ERROR ||
                  details === HlsCtor.ErrorDetails.BUFFER_APPENDING_ERROR) &&
                video.error != null;

              if (isAudioCodecError(details, reason)) {
                if (mediaErrorStage === 0) {
                  mediaErrorStage = 1;
                  hls!.swapAudioCodec();
                  hls!.recoverMediaError();
                  return;
                }
                if (mediaErrorStage === 1) {
                  mediaErrorStage = 2;
                  hardResetMediaElement(true);
                  return;
                }
                if (mediaErrorStage === 2 && hlsRecreateAttempt < 1) {
                  mediaErrorStage = 0;
                  hlsRecreateAttempt++;
                  attachHlsInstance({
                    preferManagedMediaSource: false,
                    defaultAudioCodec: "mp4a.40.5",
                  });
                  return;
                }
              }

              if (mediaErrorStage === 0) {
                if (appendWithVideoError) {
                  mediaErrorStage = 3;
                  hardResetMediaElement(false);
                  return;
                }
                mediaErrorStage = 1;
                hls!.recoverMediaError();
                return;
              }
              if (mediaErrorStage === 1) {
                mediaErrorStage = 2;
                hls!.swapAudioCodec();
                hls!.recoverMediaError();
                return;
              }
              if (mediaErrorStage === 2) {
                mediaErrorStage = 3;
                hardResetMediaElement(false);
                return;
              }
              if (mediaErrorStage === 3) {
                mediaErrorStage = 4;
                hardResetMediaElement(true);
                return;
              }
            }

            if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && networkRetries < 3) {
              networkRetries++;
              networkRetryTimer = setTimeout(() => {
                networkRetryTimer = null;
                if (!cancelled && hls) {
                  if (video.paused) {
                    hlsLoadStoppedForPause = true;
                    return;
                  }
                  // A fatal manifest/level error stops hls.js's loader. Merely
                  // calling startLoad() leaves it on a black frame; reload the
                  // same backend-only source so it requests the shared snapshot.
                  hls.stopLoad();
                  hls.loadSource(activeSrc);
                  hls.startLoad();
                }
              }, 3_000 * networkRetries);
              return;
            }

            onErrorRef.current?.(err);
          };

          attachHlsInstance();
        } else if (hlsMode && canNativeHls) {
          isNativeHls = true;
          // Ensure remote playback / PiP stay enabled for Safari.
          video.disablePictureInPicture = false;
          video.disableRemotePlayback = false;
          video.src = activeSrc;
          video.addEventListener("loadedmetadata", bumpSession);
          video.addEventListener(
            "canplay",
            () => {
              void video.play().catch(() => {
                video.dispatchEvent(new Event("pause"));
              });
            },
            { once: true },
          );
        } else {
          video.disablePictureInPicture = false;
          video.disableRemotePlayback = false;
          nativeErrorListener = () => {
            const fallbackUrl = progressiveCompatibilityUrl({
              src: activeSrc,
              playbackMode: activePlaybackMode,
              mediaErrorCode: video.error?.code,
            });
            if (fallbackUrl) {
              reportPlaybackEvent("compatibility-fallback", {
                from: "native-progressive",
                to: "hls-transcode",
                errorCode: video.error?.code ?? null,
              });
              setCompatibilityFallback({ source: src, url: fallbackUrl });
              return;
            }

            onErrorRef.current?.({
              type: "media",
              details: `native-media-error-${video.error?.code ?? "unknown"}`,
              fatal: true,
              reason:
                video.error?.message ||
                "The browser could not play this media source.",
            });
          };
          video.addEventListener("error", nativeErrorListener);
          video.src = activeSrc;
          video.addEventListener(
            "canplay",
            () => {
              void video.play().catch(() => {
                video.dispatchEvent(new Event("pause"));
              });
            },
            { once: true },
          );
        }

        onSessionChangeRef.current?.(buildSession());
      };

      let deferredRafId: number | null = null;
      let raf1 = 0;

      void (async () => {
        if (mpegtsMode) {
          try {
            const mod = await import("mpegts.js");
            if (cancelled) return;
            const mpegts = mod.default;
            if (!mpegts.getFeatureList().mseLivePlayback) {
              throw new Error("This browser does not support live MPEG-TS playback.");
            }
            const player = mpegts.createPlayer(
              { type: "mpegts", isLive: true, url: activeSrc, cors: false, withCredentials: true },
              {
                enableStashBuffer: false,
                isLive: true,
                lazyLoad: false,
                autoCleanupSourceBuffer: true,
                autoCleanupMaxBackwardDuration: 30,
                autoCleanupMinBackwardDuration: 15,
              },
            ) as MpegTsPlayer;
            player.on(mpegts.Events.ERROR, (...args: unknown[]) => {
              reportPlaybackEvent("error", {
                errorType: String(args[0] ?? "mpegts"),
                errorDetails: String(args[1] ?? "playback-error"),
                errorMessage: typeof args[2] === "string" ? args[2] : undefined,
                fatal: true,
              });
              onErrorRef.current?.({
                type: String(args[0] ?? "mpegts"),
                details: String(args[1] ?? "playback-error"),
                fatal: true,
                reason: typeof args[2] === "string" ? args[2] : undefined,
              });
            });
            mpegtsPlayer = player;
          } catch (e) {
            reportPlaybackEvent("error", {
              errorType: "mpegts",
              errorDetails: "unsupported",
              errorMessage: e instanceof Error ? e.message : "MPEG-TS player failed to load.",
              fatal: true,
            });
            onErrorRef.current?.({
              type: "mpegts",
              details: "unsupported",
              fatal: true,
              reason: e instanceof Error ? e.message : "MPEG-TS player failed to load.",
            });
          }
        } else if (hlsMode) {
          try {
            const mod = await import("hls.js");
            if (cancelled) return;
            HlsModule = mod.default;
          } catch (e) {
            console.warn("[player] hls.js load failed", e);
            reportPlaybackEvent("error", {
              errorType: "hls-loader",
              errorDetails: "module-load-failed",
              errorMessage: e instanceof Error ? e.message : String(e),
              fatal: true,
            });
          }
        }
        if (cancelled) return;
        raf1 = requestAnimationFrame(() => {
          deferredRafId = requestAnimationFrame(startPlayback);
        });
      })();

      return () => {
        reportPlaybackEvent("session-end");
        cancelled = true;
        if (streamSessionId) {
          for (const [event, listener] of Object.entries(telemetryListeners)) {
            video.removeEventListener(event, listener);
          }
        }
        clearWaitingReporter();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        video.removeEventListener("pause", suspendHlsLoadWhilePaused);
        video.removeEventListener("play", resumeHlsLoadForPlayback);
        clearMediaHardResetTimer();
        if (networkRetryTimer) clearTimeout(networkRetryTimer);
        if (raf1) cancelAnimationFrame(raf1);
        if (deferredRafId !== null) cancelAnimationFrame(deferredRafId);
        if (nativeErrorListener) {
          video.removeEventListener("error", nativeErrorListener);
        }
        if (hls) {
          try {
            if (HlsModule) {
              hls.off(HlsModule.Events.ERROR);
              hls.off(HlsModule.Events.MANIFEST_PARSED);
              hls.off(HlsModule.Events.MANIFEST_LOADING);
              hls.off(HlsModule.Events.MANIFEST_LOADED);
              hls.off(HlsModule.Events.LEVEL_LOADING);
              hls.off(HlsModule.Events.LEVEL_LOADED);
              hls.off(HlsModule.Events.FRAG_LOADING);
              hls.off(HlsModule.Events.FRAG_LOADED);
              hls.off(HlsModule.Events.LEVEL_SWITCHED);
              hls.off(HlsModule.Events.FRAG_BUFFERED);
              hls.off(HlsModule.Events.AUDIO_TRACKS_UPDATED);
              hls.off(HlsModule.Events.SUBTITLE_TRACKS_UPDATED);
            }
          } catch {
            /* ignore */
          }
          hls.stopLoad();
          hls.destroy();
          hls = null;
        }
        if (mpegtsPlayer) {
          try {
            mpegtsPlayer.unload();
            mpegtsPlayer.detachMediaElement();
            mpegtsPlayer.destroy();
          } catch {
            /* best-effort MPEG-TS teardown */
          }
          mpegtsPlayer = null;
        }
        video.removeEventListener("loadedmetadata", bumpSession);
        onSessionChangeRef.current?.(null);
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }, [
      activePlaybackMode,
      activeSrc,
      hlsConfigExtra,
      src,
      usesCompatibilityFallback,
    ]);

    return (
      <video
        ref={mergeRefs(setRef, ref)}
        className={cn("h-full w-full bg-background object-contain", className)}
        controls={controls}
        playsInline
        // Keep remote playback / PiP allowed (hls.js ManagedMediaSource may flip these).
        disablePictureInPicture={false}
        disableRemotePlayback={false}
        preload="auto"
        autoPlay
      />
    );
  }
