"use client";

import type { HlsConfig } from "hls.js";
import type Hls from "hls.js";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { getStreamHlsConfig } from "@/lib/player/hls-live-config";
import type { PlaybackMode } from "@/lib/stream/playback-url";
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

export const StreamPlayer = forwardRef<HTMLVideoElement, Props>(
  function StreamPlayer(
    {
      src,
      className,
      controls = true,
      onSessionChange,
      onError,
      hlsConfig: hlsConfigExtra,
      playbackMode,
    },
    ref,
  ) {
    const innerRef = useRef<HTMLVideoElement>(null);
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
    }, [src]);

    useEffect(() => {
      const video = innerRef.current;
      if (!video || !src) return;

      let hls: Hls | null = null;
      let HlsModule: typeof import("hls.js").default | null = null;
      let networkRetryTimer: ReturnType<typeof setTimeout> | null = null;
      let mediaHardResetTimer: ReturnType<typeof setTimeout> | null = null;
      let hlsRecreateAttempt = 0;
      const hlsMode = shouldUseHls(src, playbackMode);
      let isNativeHls = false;
      let cancelled = false;

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
                hls.loadSource(src);
              }
              hls.attachMedia(video);
              hls.startLoad();
            }, 80);
          };

          const onManifestParsed = () => {
            resetMediaErrorStage();
            hlsRecreateAttempt = 0;
            bumpSession();
            void video.play().catch(() => {});
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
            hls = new HlsCtor({
              ...getStreamHlsConfig(),
              ...hlsConfigExtra,
              ...configOverrides,
            });
            hls.on(HlsCtor.Events.MANIFEST_PARSED, onManifestParsed);
            hls.on(HlsCtor.Events.LEVEL_SWITCHED, bumpSession);
            hls.on(HlsCtor.Events.FRAG_BUFFERED, resetMediaErrorStage);
            hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, bumpSession);
            hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, bumpSession);
            hls.on(HlsCtor.Events.ERROR, onHlsError);
            hls.loadSource(src);
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
                if (!cancelled && hls) hls.startLoad();
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
          video.src = src;
          video.addEventListener("loadedmetadata", bumpSession);
          video.addEventListener(
            "canplay",
            () => {
              void video.play().catch(() => {});
            },
            { once: true },
          );
        } else {
          video.disablePictureInPicture = false;
          video.disableRemotePlayback = false;
          video.src = src;
          video.addEventListener(
            "canplay",
            () => {
              void video.play().catch(() => {});
            },
            { once: true },
          );
        }

        onSessionChangeRef.current?.(buildSession());
      };

      let deferredRafId: number | null = null;
      let raf1 = 0;

      void (async () => {
        if (hlsMode) {
          try {
            const mod = await import("hls.js");
            if (cancelled) return;
            HlsModule = mod.default;
          } catch (e) {
            console.warn("[player] hls.js load failed", e);
          }
        }
        if (cancelled) return;
        raf1 = requestAnimationFrame(() => {
          deferredRafId = requestAnimationFrame(startPlayback);
        });
      })();

      return () => {
        cancelled = true;
        clearMediaHardResetTimer();
        if (networkRetryTimer) clearTimeout(networkRetryTimer);
        if (raf1) cancelAnimationFrame(raf1);
        if (deferredRafId !== null) cancelAnimationFrame(deferredRafId);
        if (hls) {
          try {
            if (HlsModule) {
              hls.off(HlsModule.Events.ERROR);
              hls.off(HlsModule.Events.MANIFEST_PARSED);
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
        video.removeEventListener("loadedmetadata", bumpSession);
        onSessionChangeRef.current?.(null);
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }, [src, hlsConfigExtra, playbackMode]);

    return (
      <video
        ref={mergeRefs(setRef, ref)}
        className={cn("h-full w-full bg-black object-contain", className)}
        controls={controls}
        playsInline
        // Keep remote playback / PiP allowed (hls.js ManagedMediaSource may flip these).
        disablePictureInPicture={false}
        disableRemotePlayback={false}
        preload="auto"
        autoPlay
      />
    );
  },
);

StreamPlayer.displayName = "StreamPlayer";
