"use client";

import Hls from "hls.js";
import type { HlsConfig } from "hls.js";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { getStreamHlsConfig } from "@/lib/player/hls-live-config";
import type { PlaybackMode } from "@/lib/stream/playback-url";
import { cn } from "@/lib/utils";

export type QualityOption = { index: number; label: string };

export type PlayerSession = {
  video: HTMLVideoElement;
  hls: Hls | null;
  isNativeHls: boolean;
  getQualityOptions(): QualityOption[];
  setQualityLevel(levelIndex: number): void;
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

    /**
     * Run after paint and defer `loadSource` one frame so rapid mount/unmount (e.g. React 19
     * `reappearLayoutEffects` / navigation) does not leave two HLS instances fetching the same
     * manifest or overlapping segment requests.
     */
    useEffect(() => {
      const video = innerRef.current;
      if (!video || !src) return;

      let hls: Hls | null = null;
      let networkRetryTimer: ReturnType<typeof setTimeout> | null = null;
      let mediaHardResetTimer: ReturnType<typeof setTimeout> | null = null;
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
      });

      const clearMediaHardResetTimer = () => {
        if (mediaHardResetTimer) {
          clearTimeout(mediaHardResetTimer);
          mediaHardResetTimer = null;
        }
      };

      const startPlayback = () => {
        if (cancelled) return;

        if (hlsMode && Hls.isSupported()) {
          /** After a successful fragment, the next media error starts from step 1 again. */
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

          /**
           * `bufferAppendError` often leaves `video.error` set; soft `recoverMediaError()` is not
           * always enough. Detach, `video.load()`, reattach — similar to many manual pause/play recoveries.
           */
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
            bumpSession();
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

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              const details = data.details as string | undefined;
              const appendWithVideoError =
                (details === Hls.ErrorDetails.BUFFER_APPEND_ERROR ||
                  details === Hls.ErrorDetails.BUFFER_APPENDING_ERROR) &&
                video.error != null;

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

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 3) {
              networkRetries++;
              networkRetryTimer = setTimeout(() => {
                networkRetryTimer = null;
                if (!cancelled && hls) hls.startLoad();
              }, 3_000 * networkRetries);
              return;
            }

            onErrorRef.current?.(err);
          };

          hls = new Hls({
            ...getStreamHlsConfig(),
            ...hlsConfigExtra,
          });
          hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
          hls.on(Hls.Events.LEVEL_SWITCHED, bumpSession);
          hls.on(Hls.Events.FRAG_BUFFERED, resetMediaErrorStage);
          hls.on(Hls.Events.ERROR, onHlsError);
          hls.loadSource(src);
          hls.attachMedia(video);
        } else if (hlsMode && video.canPlayType("application/vnd.apple.mpegurl")) {
          isNativeHls = true;
          video.src = src;
        } else {
          video.src = src;
        }

        onSessionChangeRef.current?.(buildSession());
      };

      let deferredRafId: number | null = null;
      const raf1 = requestAnimationFrame(() => {
        deferredRafId = requestAnimationFrame(startPlayback);
      });

      return () => {
        cancelled = true;
        clearMediaHardResetTimer();
        if (networkRetryTimer) clearTimeout(networkRetryTimer);
        cancelAnimationFrame(raf1);
        if (deferredRafId !== null) cancelAnimationFrame(deferredRafId);
        if (hls) {
          hls.off(Hls.Events.ERROR);
          hls.off(Hls.Events.MANIFEST_PARSED);
          hls.off(Hls.Events.LEVEL_SWITCHED);
          hls.off(Hls.Events.FRAG_BUFFERED);
          hls.stopLoad();
          hls.destroy();
          hls = null;
        }
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
        preload="auto"
        autoPlay
      />
    );
  },
);

StreamPlayer.displayName = "StreamPlayer";
