"use client";

import { Button } from "@appica/ui-react/button";
import { useEffect, useMemo, useState } from "react";

import { zendeFetch } from "@/lib/auth/zende-fetch";
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
};

function parsePositiveInt(raw: string | null | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Load intro windows from `/api/media/intro` (The Intro DB). */
export function useIntroSegments(query: IntroQuery): IntroSegment[] {
  const [segments, setSegments] = useState<IntroSegment[]>([]);
  const season = parsePositiveInt(query.season);
  const episode = parsePositiveInt(query.episodeNum);
  const imdbId = query.imdbId?.trim() || undefined;
  const tmdbId = query.tmdbId?.trim().match(/^\d{1,10}$/)?.[0];

  useEffect(() => {
    if (!query.enabled || (!imdbId && !tmdbId)) {
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
  }, [query.enabled, imdbId, tmdbId, season, episode]);

  return segments;
}

function activeIntroSegment(
  segments: IntroSegment[],
  currentTimeSeconds: number,
): IntroSegment | null {
  if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) return null;
  const t = currentTimeSeconds * 1000;
  return (
    segments.find((segment) => t >= segment.startMs && t < segment.endMs) ?? null
  );
}

type SkipIntroButtonProps = {
  segments: IntroSegment[];
  currentTimeSeconds: number;
  onSkipTo: (seconds: number) => void;
  chromeVisible?: boolean;
  className?: string;
};

/** Floating Skip intro control — visible only while playback is inside an intro window. */
export function SkipIntroButton({
  segments,
  currentTimeSeconds,
  onSkipTo,
  chromeVisible = true,
  className,
}: SkipIntroButtonProps) {
  const active = useMemo(
    () => activeIntroSegment(segments, currentTimeSeconds),
    [segments, currentTimeSeconds],
  );
  if (!active) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-3 z-40 transition-[bottom] duration-300 sm:right-5",
        chromeVisible ? "bottom-36 sm:bottom-32" : "bottom-8 sm:bottom-10",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        aria-label="Skip intro"
        onClick={() => onSkipTo(active.endMs / 1000)}
        className={cn(
          "h-11 rounded-full border border-border bg-foreground px-5 text-[14px] font-semibold text-background",
          "shadow-lg outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        Skip intro
      </Button>
    </div>
  );
}
