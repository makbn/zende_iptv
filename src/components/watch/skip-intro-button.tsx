"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { zendeFetch } from "@/lib/auth/zende-fetch";
import { isTvEnvironment } from "@/lib/tv/tv-environment";
import { cn } from "@/lib/utils";

export type IntroSegment = {
  startMs: number;
  endMs: number;
};

type IntroQuery = {
  enabled: boolean;
  imdbId?: string | null;
  tmdbId?: string | null;
  season?: string | null;
  episodeNum?: string | null;
  /** When the stream session already carried intro windows, skip the extra fetch. */
  preloaded?: IntroSegment[] | null;
};

function parsePositiveInt(raw: string | null | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Load intro windows from session meta or `/api/media/intro` (The Intro DB). */
export function useIntroSegments(query: IntroQuery): IntroSegment[] {
  const [segments, setSegments] = useState<IntroSegment[]>([]);
  const season = parsePositiveInt(query.season);
  const episode = parsePositiveInt(query.episodeNum);
  const imdbId = query.imdbId?.trim() || undefined;
  const tmdbId = query.tmdbId?.trim().match(/^\d{1,10}$/)?.[0];
  const preloaded = query.preloaded;
  const preloadedKey =
    preloaded === undefined
      ? "unset"
      : preloaded === null
        ? "null"
        : JSON.stringify(preloaded);

  useEffect(() => {
    if (!query.enabled) {
      setSegments([]);
      return;
    }
    if (preloaded !== undefined && preloaded !== null) {
      setSegments(
        preloaded.filter(
          (row) =>
            row &&
            Number.isFinite(row.startMs) &&
            Number.isFinite(row.endMs) &&
            row.endMs > row.startMs,
        ),
      );
      return;
    }
    if (!imdbId && !tmdbId) {
      setSegments([]);
      return;
    }
    const params = new URLSearchParams();
    if (imdbId) params.set("imdbId", imdbId);
    if (tmdbId) params.set("tmdbId", tmdbId);
    if (season != null && episode != null) {
      params.set("season", String(season));
      params.set("episode", String(episode));
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await zendeFetch(`/api/media/intro?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json().catch(() => null)) as {
          segments?: IntroSegment[];
        } | null;
        if (cancelled) return;
        const next = Array.isArray(body?.segments)
          ? body.segments.filter(
              (row) =>
                row &&
                Number.isFinite(row.startMs) &&
                Number.isFinite(row.endMs) &&
                row.endMs > row.startMs,
            )
          : [];
        setSegments(next);
      } catch {
        if (!cancelled) setSegments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query.enabled, imdbId, tmdbId, season, episode, preloaded, preloadedKey]);

  return segments;
}

function activeIntroSegment(
  segments: IntroSegment[],
  currentTimeSeconds: number,
  dismissedEndMs: number | null,
): IntroSegment | null {
  if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) return null;
  const t = currentTimeSeconds * 1000;
  return (
    segments.find(
      (segment) =>
        t >= segment.startMs &&
        t < segment.endMs &&
        (dismissedEndMs == null || segment.endMs !== dismissedEndMs),
    ) ?? null
  );
}

type SkipIntroButtonProps = {
  segments: IntroSegment[];
  /** Prefer the live media element so visibility tracks real playback, not chrome UI state. */
  videoRef: RefObject<HTMLVideoElement | null>;
  onSkipTo: (seconds: number) => void;
  /** TV: reveal bottom chrome so Down can reach seek/play. */
  onRevealChrome?: () => void;
  chromeVisible?: boolean;
  className?: string;
};

/**
 * Floating Skip intro control — visible only while playback is inside an intro
 * window. On TV it auto-focuses so the remote OK key works without a pointer.
 */
export function SkipIntroButton({
  segments,
  videoRef,
  onSkipTo,
  onRevealChrome,
  chromeVisible = true,
  className,
}: SkipIntroButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [dismissedEndMs, setDismissedEndMs] = useState<number | null>(null);
  const focusedForSegmentRef = useRef<number | null>(null);

  useEffect(() => {
    if (segments.length === 0) {
      setCurrentTimeSeconds(0);
      return;
    }
    const sync = () => {
      const v = videoRef.current;
      if (!v) return;
      const next = Number.isFinite(v.currentTime) ? Math.max(0, v.currentTime) : 0;
      setCurrentTimeSeconds((previous) =>
        Math.abs(previous - next) >= 0.25 ? next : previous,
      );
    };
    sync();
    const v = videoRef.current;
    v?.addEventListener("timeupdate", sync);
    // Some TV WebViews throttle timeupdate while chrome is idle.
    const interval = window.setInterval(sync, 500);
    return () => {
      v?.removeEventListener("timeupdate", sync);
      window.clearInterval(interval);
    };
  }, [segments.length, videoRef]);

  const active = useMemo(
    () => activeIntroSegment(segments, currentTimeSeconds, dismissedEndMs),
    [segments, currentTimeSeconds, dismissedEndMs],
  );

  useEffect(() => {
    if (!active) {
      focusedForSegmentRef.current = null;
      return;
    }
    if (!isTvEnvironment()) return;
    if (focusedForSegmentRef.current === active.endMs) return;
    focusedForSegmentRef.current = active.endMs;
    const frame = window.requestAnimationFrame(() => {
      buttonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  if (!active) return null;

  const skip = () => {
    setDismissedEndMs(active.endMs);
    onSkipTo(active.endMs / 1000 + 0.05);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-3 z-40 transition-[bottom] duration-300 sm:right-5",
        chromeVisible ? "bottom-36 sm:bottom-32" : "bottom-8 sm:bottom-10",
        className,
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        id="tv-skip-intro"
        aria-label="Skip intro"
        data-tv-nav-down="#tv-player-play"
        data-tv-nav-up="#tv-player-back"
        onClick={skip}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "Down") return;
          event.preventDefault();
          event.stopPropagation();
          onRevealChrome?.();
          window.requestAnimationFrame(() => {
            document
              .getElementById("tv-player-play")
              ?.focus({ preventScroll: true });
          });
        }}
        className={cn(
          "h-12 min-w-[9rem] rounded-full border-2 border-border bg-foreground px-6 text-[15px] font-semibold text-background",
          "shadow-lg outline-none hover:bg-foreground/90",
          "focus:ring-4 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
          "focus-visible:ring-4 focus-visible:ring-primary",
        )}
      >
        Skip intro
      </button>
    </div>
  );
}
