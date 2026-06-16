"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronLeft, ChevronRight, ListVideo } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { SeriesEpisodeRow } from "@/app/api/xtream/series-info/route";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
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
    <ZenedeGlass variant="iconChip" className="inline-flex">
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "flex h-12 min-w-12 items-center justify-center rounded-full bg-transparent text-white outline-none sm:h-11 sm:min-w-11",
          "hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white",
          "disabled:cursor-not-allowed disabled:opacity-35",
        )}
      >
        {children}
      </button>
    </ZenedeGlass>
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
    <div className="pointer-events-auto flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="min-w-0 truncate text-[13px] font-medium text-white/75 sm:text-[14px]">
          {playback.seriesTitle ?? showTitle ?? "Show"}
          <span className="text-white/40"> · </span>
          <span className="text-white/90">{episodeLabel}</span>
          {playback.episodeTitle ? (
            <span className="hidden text-white/55 sm:inline">
              {" "}
              · {playback.episodeTitle}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <GlassIconButton
          aria-label="Previous episode"
          disabled={disabled || busy || !prevEp || loading}
          onClick={() => prevEp && currentIndex > 0 && void jumpToEpisode(prevEp, currentIndex - 1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </GlassIconButton>

        <Menu.Root modal={false}>
          <ZenedeGlass variant="iconChip" className="inline-flex">
            <Menu.Trigger
              disabled={disabled || busy || loading || flat.length === 0}
              aria-label="Choose episode"
              className={cn(
                "flex h-12 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white outline-none sm:h-11",
                "hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white",
                "disabled:cursor-not-allowed disabled:opacity-35",
                "data-[popup-open]:bg-white/12",
              )}
            >
              <ListVideo className="h-4 w-4" aria-hidden />
              Episodes
            </Menu.Trigger>
          </ZenedeGlass>
          <Menu.Portal>
            <Menu.Positioner side="top" align="center" sideOffset={12} className="z-[100]">
              <Menu.Popup className="flex max-h-[min(70vh,520px)] w-[min(92vw,420px)] flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-black/80 shadow-2xl outline-none backdrop-blur-2xl">
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-white/45">
                    {playback.seriesTitle ?? showTitle ?? "Show"}
                  </p>
                </div>
                <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2 py-2">
                  {episodesBySeason.seasons.map((season) => (
                    <button
                      key={season}
                      type="button"
                      onClick={() => setPickerSeason(season)}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium",
                        activeSeason === season
                          ? "bg-white text-zinc-950"
                          : "bg-white/10 text-white/70 hover:bg-white/15",
                      )}
                    >
                      S{season}
                    </button>
                  ))}
                </div>
                <Menu.Viewport className="min-h-0 flex-1 overflow-y-auto p-2">
                  <Menu.Group>
                    {(episodesBySeason.map.get(activeSeason ?? "") ?? []).map((ep) => (
                      <Menu.Item
                        key={ep.playUrl}
                        className={cn(
                          "flex cursor-pointer flex-col rounded-xl px-3 py-2.5 text-left outline-none",
                          "data-[highlighted]:bg-white/12",
                          ep.index === currentIndex && "bg-emerald-500/15",
                        )}
                        onClick={() => void jumpToEpisode(ep, ep.index)}
                      >
                        <span className="text-[14px] font-medium text-white">
                          {formatEpisodeCode(ep.season, ep.episodeNum)}
                          {ep.title ? ` · ${ep.title}` : ""}
                        </span>
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                </Menu.Viewport>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

        <GlassIconButton
          aria-label="Next episode"
          disabled={disabled || busy || !nextEp || loading}
          onClick={() =>
            nextEp && currentIndex >= 0 && void jumpToEpisode(nextEp, currentIndex + 1)
          }
        >
          <ChevronRight className="h-5 w-5" />
        </GlassIconButton>
      </div>
    </div>
  );
}
