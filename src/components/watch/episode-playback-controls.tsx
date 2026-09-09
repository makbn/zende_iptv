"use client";

import { Button } from "@appica/ui-react/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@appica/ui-react/dialog";
import { ChevronLeft, ChevronRight, ListVideo } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";

import type { SeriesEpisodeRow } from "@/app/api/xtream/series-info/route";
import { useSeriesInfo } from "@/features/iptv/use-series-info";
import {
  buildEpisodeWatchChannel,
  formatEpisodeCode,
  resolveSeriesEpisodeIndex,
} from "@/lib/playback/play-episode";
import { createWatchUrl } from "@/lib/navigation/watch-url";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import { cn } from "@/lib/utils";

type Props = {
  playback: PlaybackSessionMeta;
  logo?: string | null;
  group?: string | null;
  disabled?: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
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

export function EpisodePlaybackControls({ playback, logo, group, disabled, videoRef }: Props) {
  const router = useRouter();
  const seriesId = playback.seriesId ?? null;
  const { episodesBySeason, showTitle, loading } = useSeriesInfo(seriesId);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSeason, setPickerSeason] = useState<string | null>(null);
  const initialEpisodeRef = useRef<HTMLButtonElement>(null);
  const autoAdvancingRef = useRef(false);

  const flat = episodesBySeason.flat;
  const currentIndex = resolveSeriesEpisodeIndex(flat, playback);
  const prevEp = currentIndex > 0 ? flat[currentIndex - 1] : null;
  const nextEp =
    currentIndex >= 0 && currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null;

  const currentSeason = playback.season && episodesBySeason.seasons.includes(playback.season)
    ? playback.season
    : null;
  const activeSeason = pickerSeason ?? currentSeason ?? episodesBySeason.seasons[0] ?? null;
  const activeEpisodes = episodesBySeason.map.get(activeSeason ?? "") ?? [];

  const jumpToEpisode = useCallback(
    async (episode: SeriesEpisodeRow, episodeIndex: number) => {
      if (!seriesId) return false;
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
        setPickerOpen(false);
        router.replace(href);
        return true;
      } catch {
        return false;
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

  useEffect(() => {
    autoAdvancingRef.current = false;
  }, [playback.season, playback.episodeNum]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.loop = false;
    const onEnded = () => {
      video.pause();
      if (!nextEp || currentIndex < 0 || autoAdvancingRef.current) return;
      autoAdvancingRef.current = true;
      void jumpToEpisode(nextEp, currentIndex + 1).then((advanced) => {
        if (!advanced) autoAdvancingRef.current = false;
      });
    };
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [currentIndex, jumpToEpisode, nextEp, videoRef]);

  const openEpisodePicker = () => {
    setPickerSeason(currentSeason ?? episodesBySeason.seasons[0] ?? null);
    setPickerOpen(true);
  };

  if (!seriesId || playback.contentKind !== "episode") return null;

  return (
    <>
      <GlassIconButton
        aria-label="Previous episode"
        disabled={disabled || busy || !prevEp || loading}
        onClick={() =>
          prevEp && currentIndex > 0 && void jumpToEpisode(prevEp, currentIndex - 1)
        }
      >
        <span className="flex items-center gap-1.5 px-2">
          <ChevronLeft className="h-5 w-5" />
          <span className="hidden text-[12px] font-semibold sm:inline">Prev</span>
        </span>
      </GlassIconButton>

      <Button
        variant="ghost"
        type="button"
        disabled={disabled || busy || loading || flat.length === 0}
        aria-label="Choose episode"
        onClick={openEpisodePicker}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[12px] font-semibold text-foreground-intense outline-none transition-colors sm:h-10",
          "hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-primary",
          "disabled:cursor-not-allowed disabled:opacity-35",
        )}
      >
        <ListVideo className="h-4 w-4" aria-hidden />
        Episodes
      </Button>

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

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent
          closeButton={false}
          initialFocus={initialEpisodeRef}
          className="tv-episode-picker-dialog h-[min(82vh,780px)] w-[min(90vw,1240px)] max-w-none"
          backdropProps={{ className: "bg-black/75 backdrop-blur-md" }}
          viewportProps={{ className: "p-[4vw]" }}
        >
          <DialogHeader className="border-b border-white/10 px-8 pb-6 pt-7">
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-primary-strong">
              Choose an episode
            </p>
            <DialogTitle className="truncate text-[32px] text-white">
              {playback.seriesTitle ?? showTitle ?? "Show"}
            </DialogTitle>
            <DialogDescription className="text-[15px] text-white/65">
              Left and right changes season. Up and down chooses an episode. Press OK to play; Back closes.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex min-h-0 flex-1 flex-col px-0 pb-0">
            <div
              id="tv-episode-picker-seasons"
              data-tv-layout="horizontal"
              data-tv-nav-down="#tv-episode-picker-list"
              className="tv-episode-picker-seasons flex shrink-0 gap-3 overflow-x-auto border-b border-white/10 px-8 py-5"
            >
              {episodesBySeason.seasons.map((season) => (
                <Button
                  key={season}
                  type="button"
                  variant={activeSeason === season ? "primary" : "secondary"}
                  onFocus={() => setPickerSeason(season)}
                  onClick={() => setPickerSeason(season)}
                  className={cn(
                    "shrink-0 rounded-xl px-6 py-3 text-[17px] font-bold",
                    activeSeason !== season && "bg-white/8 text-white hover:bg-white/14",
                  )}
                >
                  Season {season}
                </Button>
              ))}
            </div>

            <div
              id="tv-episode-picker-list"
              data-tv-layout="vertical"
              data-tv-nav-up="#tv-episode-picker-seasons"
              className="tv-episode-picker-list min-h-0 flex-1 overflow-y-auto px-8 py-5"
            >
              {activeEpisodes.map((ep, seasonIndex) => {
                const current = ep.index === currentIndex;
                const receivesInitialFocus = current || (currentIndex < 0 && seasonIndex === 0);
                return (
                  <Button
                    ref={receivesInitialFocus ? initialEpisodeRef : undefined}
                    key={ep.playUrl}
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void jumpToEpisode(ep, ep.index)}
                    aria-label={`Play ${formatEpisodeCode(ep.season, ep.episodeNum)}${ep.title ? `, ${ep.title}` : ""}`}
                    className={cn(
                      "tv-episode-picker-row mb-3 flex min-h-[76px] w-full items-center gap-5 rounded-xl border border-white/10 bg-white/[0.055] px-5 py-3 text-left text-white",
                      "hover:bg-white/10 focus-visible:border-primary focus-visible:bg-white/12 focus-visible:ring-2 focus-visible:ring-primary",
                      current && "border-primary/60 bg-primary/15",
                    )}
                  >
                    <span className="flex h-11 min-w-20 shrink-0 items-center justify-center rounded-lg bg-black/35 px-3 text-[16px] font-extrabold text-white">
                      {formatEpisodeCode(ep.season, ep.episodeNum)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[18px] font-bold text-white">
                        {ep.title || `Episode ${ep.episodeNum || seasonIndex + 1}`}
                      </span>
                      <span className="mt-1 block text-[14px] font-medium text-white/60">
                        {ep.durationSeconds ? `${Math.round(ep.durationSeconds / 60)} min` : "Play episode"}
                        {current ? " · Now playing" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-5 py-2 text-[14px] font-extrabold text-black">
                      Play
                    </span>
                  </Button>
                );
              })}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
