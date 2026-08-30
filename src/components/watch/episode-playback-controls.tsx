"use client";

import { Button } from "@appica/ui-react/button";

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@appica/ui-react/dropdown-menu";
import { ChevronLeft, ChevronRight, ListVideo } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { SeriesEpisodeRow } from "@/app/api/xtream/series-info/route";
import { useSeriesInfo } from "@/features/iptv/use-series-info";
import { buildEpisodeWatchChannel, formatEpisodeCode } from "@/lib/playback/play-episode";
import { createWatchUrl } from "@/lib/navigation/watch-url";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import { cn } from "@/lib/utils";

type Props = {
  playback: PlaybackSessionMeta;
  logo?: string | null;
  group?: string | null;
  disabled?: boolean;
};

function GlassIconButton({
  children,
  onClick,
  disabled,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
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
      )}
    >
      {children}
    </Button>
  );
}

export function EpisodePlaybackControls({ playback, logo, group, disabled }: Props) {
  const router = useRouter();
  const seriesId = playback.seriesId ?? null;
  const { episodesBySeason, showTitle, loading } = useSeriesInfo(seriesId);
  const [busy, setBusy] = useState(false);
  const [pickerSeason, setPickerSeason] = useState<string | null>(null);

  const flat = episodesBySeason.flat;
  const currentIndex = playback.episodeIndex ?? -1;
  const prevEp = currentIndex > 0 ? flat[currentIndex - 1] : null;
  const nextEp =
    currentIndex >= 0 && currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null;

  const activeSeason = pickerSeason ?? episodesBySeason.seasons[0] ?? null;

  const episodeLabel = useMemo(() => {
    if (playback.season && playback.episodeNum) {
      return formatEpisodeCode(playback.season, playback.episodeNum);
    }
    return playback.episodeTitle ?? "Episode";
  }, [playback]);

  const jumpToEpisode = useCallback(
    async (episode: SeriesEpisodeRow, episodeIndex: number) => {
      if (!seriesId) return;
      setBusy(true);
      try {
        const channel = buildEpisodeWatchChannel({
          seriesId,
          seriesTitle: playback.seriesTitle ?? showTitle ?? "Show",
          cover: logo ?? undefined,
          groupTitle: group ?? undefined,
          episode,
          episodeIndex,
        });
        const href = await createWatchUrl(channel);
        router.replace(href);
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [seriesId, playback.seriesTitle, showTitle, logo, group, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "n" && nextEp && currentIndex >= 0) {
        e.preventDefault();
        void jumpToEpisode(nextEp, currentIndex + 1);
      } else if (e.key === "p" && prevEp && currentIndex > 0) {
        e.preventDefault();
        void jumpToEpisode(prevEp, currentIndex - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextEp, prevEp, currentIndex, jumpToEpisode]);

  if (!seriesId || playback.contentKind !== "episode") return null;

  return (
    <div className="pointer-events-auto mb-2 rounded-lg border border-border bg-background px-2.5 py-2 ring-1 ring-border">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
            Episode
          </p>
          <p className="mt-0.5 min-w-0 truncate text-[12px] font-semibold text-foreground-intense">
            {playback.seriesTitle ?? showTitle ?? "Show"}
            <span className="text-foreground-intense"> · </span>
            <span className="text-foreground-intense">{episodeLabel}</span>
            {playback.episodeTitle ? (
              <span className="hidden text-foreground-intense md:inline">
                {" "}
                · {playback.episodeTitle}
              </span>
            ) : null}
          </p>
        </div>

        <div
          data-tv-layout="horizontal"
          className="flex shrink-0 flex-wrap items-center justify-center gap-2 sm:justify-end"
        >
        <GlassIconButton
          aria-label="Previous episode"
          disabled={disabled || busy || !prevEp || loading}
          onClick={() => prevEp && currentIndex > 0 && void jumpToEpisode(prevEp, currentIndex - 1)}
        >
          <span className="flex items-center gap-1.5 px-2">
            <ChevronLeft className="h-5 w-5" />
            <span className="hidden text-[12px] font-semibold sm:inline">Prev</span>
          </span>
        </GlassIconButton>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            disabled={disabled || busy || loading || flat.length === 0}
            aria-label="Choose episode"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[12px] font-semibold text-foreground-intense outline-none transition-colors sm:h-10",
              "hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-primary",
              "disabled:cursor-not-allowed disabled:opacity-35",
              "data-[popup-open]:bg-background-muted",
            )}
          >
            <ListVideo className="h-4 w-4" aria-hidden />
            Episodes
          </DropdownMenuTrigger>
          <>
            <DropdownMenuContent side="top" align="center" sideOffset={12} className="z-[100]">
              <div className="flex max-h-[min(70vh,520px)] w-[min(92vw,420px)] flex-col overflow-hidden rounded-lg border border-border bg-background p-1 shadow-2xl outline-none backdrop-blur-2xl">
                <div className="border-b border-border px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-intense">
                    {playback.seriesTitle ?? showTitle ?? "Show"}
                  </p>
                </div>
                <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
                  {episodesBySeason.seasons.map((season) => (
                    <Button variant="ghost"
                      key={season}
                      type="button"
                      onClick={() => setPickerSeason(season)}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium",
                        activeSeason === season
                          ? "bg-primary text-primary-foreground"
                          : "bg-background-muted text-foreground-intense hover:bg-background-muted",
                      )}
                    >
                      S{season}
                    </Button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <DropdownMenuGroup>
                    {(episodesBySeason.map.get(activeSeason ?? "") ?? []).map((ep) => (
                      <DropdownMenuItem
                        key={ep.playUrl}
                        className={cn(
                          "flex cursor-pointer flex-col rounded-xl px-3 py-2.5 text-left outline-none",
                          "data-[highlighted]:bg-background-muted",
                          ep.index === currentIndex && "bg-primary",
                        )}
                        onClick={() => void jumpToEpisode(ep, ep.index)}
                      >
                        <span className="text-[14px] font-medium text-foreground-intense">
                          {formatEpisodeCode(ep.season, ep.episodeNum)}
                          {ep.title ? ` · ${ep.title}` : ""}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </div>
              </div>
            </DropdownMenuContent>
          </>
        </DropdownMenu>

        <GlassIconButton
          aria-label="Next episode"
          disabled={disabled || busy || !nextEp || loading}
          onClick={() =>
            nextEp && currentIndex >= 0 && void jumpToEpisode(nextEp, currentIndex + 1)
          }
        >
          <span className="flex items-center gap-1.5 px-2">
            <span className="hidden text-[12px] font-semibold sm:inline">Next</span>
            <ChevronRight className="h-5 w-5" />
          </span>
        </GlassIconButton>
        </div>
      </div>
    </div>
  );
}
