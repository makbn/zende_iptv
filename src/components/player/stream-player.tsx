"use client";

import Hls from "hls.js";
import type { HlsConfig } from "hls.js";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { getStreamHlsConfig } from "@/lib/player/hls-live-config";
import { cn } from "@/lib/utils";

export type QualityOption = { index: number; label: string };

export type PlayerSession = {
  video: HTMLVideoElement;
  hls: Hls | null;
  isNativeHls: boolean;
  getQualityOptions(): QualityOption[];
  setQualityLevel(levelIndex: number): void;
};

type Props = {
  src: string;
  className?: string;
  /** Native HTML5 controls — prefer custom chrome on watch. */
  controls?: boolean;
  /** Invoked after each attach (and when manifest / levels change). Pass `null` on teardown. */
  onSessionChange?: (session: PlayerSession | null) => void;
  /** Optional extra HLS options merged after defaults (advanced). */
  hlsConfig?: Partial<HlsConfig>;
};

function looksLikeHls(url: string): boolean {
  return /\.m3u8([?#]|$)/i.test(url) || url.includes("format=m3u8");
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
      hlsConfig: hlsConfigExtra,
    },
    ref,
  ) {
    const innerRef = useRef<HTMLVideoElement>(null);
    const setRef = useCallback((node: HTMLVideoElement | null) => {
      innerRef.current = node;
    }, []);

    const onSessionChangeRef = useRef(onSessionChange);
    useLayoutEffect(() => {
      onSessionChangeRef.current = onSessionChange;
    });

    useEffect(() => {
      const video = innerRef.current;
      if (!video || !src) return;

      let hls: Hls | null = null;
      const hlsMode = looksLikeHls(src);
      let isNativeHls = false;

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

      if (hlsMode && Hls.isSupported()) {
        hls = new Hls({
          ...getStreamHlsConfig(),
          ...hlsConfigExtra,
        });
        hls.on(Hls.Events.MANIFEST_PARSED, bumpSession);
        hls.on(Hls.Events.LEVEL_SWITCHED, bumpSession);
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (hlsMode && video.canPlayType("application/vnd.apple.mpegurl")) {
        isNativeHls = true;
        video.src = src;
      } else {
        video.src = src;
      }

      onSessionChangeRef.current?.(buildSession());

      return () => {
        if (hls) {
          hls.off(Hls.Events.MANIFEST_PARSED, bumpSession);
          hls.off(Hls.Events.LEVEL_SWITCHED, bumpSession);
          hls.destroy();
          hls = null;
        }
        onSessionChangeRef.current?.(null);
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }, [src, hlsConfigExtra]);

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
