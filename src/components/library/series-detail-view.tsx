"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Download, Play } from "lucide-react";

import { ZendeGlass } from "@/components/glass/zende-glass";
import {
  BROWSE_BOTTOM_PAD_MOBILE,
  BROWSE_TOP_PAD,
} from "@/components/layout/browse-page-shell";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { useSeriesInfo } from "@/features/iptv/use-series-info";
import { buildEpisodeWatchChannel, formatEpisodeCode } from "@/lib/playback/play-episode";
import {
  getPlaybackPosition,
  playbackProgressRatio,
} from "@/lib/playback/playback-position";
import { createDownloadUrl } from "@/lib/navigation/watch-url";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import {
  listTopFrequentChannels,
  subscribeViewingStats,
  type ViewingEntry,
} from "@/lib/watch/viewing-stats";
import { cn } from "@/lib/utils";

type Props = {
  seriesId: string;
  /** Fallback title from catalog when portal info is loading. */
  fallbackTitle?: string;
  fallbackLogo?: string;
  fallbackGroup?: string;
};

function useViewingHistory(): ViewingEntry[] {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => subscribeViewingStats(() => setEpoch((n) => n + 1)), []);
  return useMemo(() => listTopFrequentChannels(200), [epoch]);
}

export function SeriesDetailView({
  seriesId,
  fallbackTitle,
  fallbackLogo,
  fallbackGroup,
}: Props) {
  const { openChannel, navError: watchNavError, clearNavError } = useWatchNavigation();
  const { loading, error, episodesBySeason, showTitle, showPlot, showCover, showBackdrop } =
    useSeriesInfo(seriesId);
  const history = useViewingHistory();
  const [seasonTab, setSeasonTab] = useState<string | null>(null);
  const [playBusy, setPlayBusy] = useState(false);
  const [downloadBusyUrl, setDownloadBusyUrl] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const displayPlayError = playError ?? watchNavError;

  const title = showTitle ?? fallbackTitle ?? "Show";
  const cover = showCover || fallbackLogo || "";
  const heroArt = showBackdrop || cover;
  const groupTitle = fallbackGroup;

  const activeSeason = seasonTab ?? episodesBySeason.seasons[0] ?? null;

  const continueTarget = useMemo(() => {
    const byUrl = new Map(
      episodesBySeason.flat.map((ep, index) => [ep.playUrl, { ep, index }]),
    );
    let best: { ep: (typeof episodesBySeason.flat)[0]; index: number; at: number } | null =
      null;
    for (const h of history) {
      const hit = byUrl.get(h.url);
      if (!hit) continue;
      if (!best || h.lastOpenedAt > best.at) {
        best = { ep: hit.ep, index: hit.index, at: h.lastOpenedAt };
      }
    }
    return best;
  }, [episodesBySeason.flat, history]);

  const playEpisode = useCallback(
    (episode: (typeof episodesBySeason.flat)[0], episodeIndex: number) => {
      setPlayBusy(true);
      setPlayError(null);
      clearNavError();
      try {
        const channel = buildEpisodeWatchChannel({
          seriesId,
          seriesTitle: title,
          cover: cover || undefined,
          groupTitle,
          episode,
          episodeIndex,
        });
        openChannel(channel);
      } catch (err) {
        setPlayError(err instanceof Error ? err.message : "Could not start playback.");
      } finally {
        setPlayBusy(false);
      }
    },
    [clearNavError, cover, groupTitle, openChannel, seriesId, title],
  );

  const downloadEpisode = useCallback(
    async (episode: (typeof episodesBySeason.flat)[0], episodeIndex: number) => {
      setDownloadBusyUrl(episode.playUrl);
      setPlayError(null);
      clearNavError();
      try {
        const channel = buildEpisodeWatchChannel({
          seriesId,
          seriesTitle: title,
          cover: cover || undefined,
          groupTitle,
          episode,
          episodeIndex,
        });
        const href = await createDownloadUrl(channel);
        const a = document.createElement("a");
        a.href = href;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        setPlayError(err instanceof Error ? err.message : "Could not start download.");
      } finally {
        setDownloadBusyUrl(null);
      }
    },
    [clearNavError, cover, groupTitle, seriesId, title],
  );

  const continueProgress = continueTarget
    ? playbackProgressRatio(
        getPlaybackPosition(continueTarget.ep.playUrl),
        continueTarget.ep.durationSeconds,
      )
    : null;

  return (
    <main
      id="main"
      className={cn(
        "zen-page-bg min-h-screen text-white",
        BROWSE_TOP_PAD,
        BROWSE_BOTTOM_PAD_MOBILE,
        "md:pb-16",
      )}
    >
      <div className="relative overflow-hidden">
        {heroArt ? (
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            {/* Fallback treatment for low-res artwork: enlarged, desaturated and pixel-emphasized */}
            {/* so compression artifacts are less distracting at hero scale. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={secureImageUrl(heroArt)}
              alt=""
              className="h-full w-full scale-[1.18] object-cover opacity-45 grayscale saturate-0 [image-rendering:pixelated]"
            />
            <div className="absolute inset-0 bg-black/28 backdrop-blur-[2px]" />
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[var(--tv-page-bg)]/92 to-[var(--tv-page-bg)]" />

        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-8 sm:pt-8">
          <Link
            href="/library?tab=series"
            className="mb-6 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-2 text-[14px] font-semibold text-white/68 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Library
          </Link>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-[26px] border border-white/12 bg-black/48 shadow-[0_28px_90px_-38px_rgba(0,0,0,0.95)] sm:mx-0 sm:w-52">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={secureImageUrl(cover, undefined, "poster")} alt="" className="aspect-[2/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-white/5 text-[13px] text-white/35">
                  No art
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="zen-kicker">
                TV Show
              </p>
              <h1 className="zen-page-title mt-3">
                {title}
              </h1>
              {groupTitle ? (
                <p className="mt-2 text-[14px] text-white/45">{groupTitle}</p>
              ) : null}
              {showPlot ? (
                <p className="zen-body-muted mt-4 max-w-3xl">
                  {showPlot}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                {continueTarget ? (
                  <button
                    type="button"
                    disabled={playBusy}
                    onClick={() => void playEpisode(continueTarget.ep, continueTarget.index)}
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] disabled:opacity-50"
                  >
                    <ZendeGlass variant="ctaPill">
                      <span className="flex min-w-[10rem] flex-col items-start gap-0.5 px-6 py-3 text-left">
                        <span className="flex items-center gap-2 text-[15px] font-semibold text-zinc-950">
                          <Play className="h-4 w-4 fill-current" aria-hidden />
                          Continue
                        </span>
                        <span className="text-[12px] font-medium text-zinc-800/80">
                          {formatEpisodeCode(
                            continueTarget.ep.season,
                            continueTarget.ep.episodeNum,
                          )}
                          {continueTarget.ep.title ? ` · ${continueTarget.ep.title}` : ""}
                        </span>
                        {continueProgress != null ? (
                          <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-900/20">
                            <span
                              className="block h-full rounded-full bg-zinc-900/70"
                              style={{ width: `${continueProgress * 100}%` }}
                            />
                          </span>
                        ) : null}
                      </span>
                    </ZendeGlass>
                  </button>
                ) : episodesBySeason.flat[0] ? (
                  <button
                    type="button"
                    disabled={playBusy || loading}
                    onClick={() => void playEpisode(episodesBySeason.flat[0]!, 0)}
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] disabled:opacity-50"
                  >
                    <ZendeGlass variant="ctaPill">
                      <span className="flex items-center gap-2 px-6 py-3 text-[15px] font-semibold text-zinc-950">
                        <Play className="h-4 w-4 fill-current" aria-hidden />
                        Play S{episodesBySeason.flat[0]!.season}E
                        {episodesBySeason.flat[0]!.episodeNum || "1"}
                      </span>
                    </ZendeGlass>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-28 sm:px-8 md:pb-16">
        {displayPlayError ? (
          <NavErrorBanner
            message={displayPlayError}
            onDismiss={() => {
              setPlayError(null);
              clearNavError();
            }}
          />
        ) : null}

        {loading ? (
          <ZendeLoadingState className="py-12" size="large" label="Loading seasons…" />
        ) : error ? (
          <p className="py-12 text-center text-[15px] text-red-300">{error}</p>
        ) : episodesBySeason.seasons.length === 0 ? (
          <p className="py-12 text-center text-[15px] text-white/45">No episodes found.</p>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {episodesBySeason.seasons.map((season) => (
                <button
                  key={season}
                  type="button"
                  onClick={() => setSeasonTab(season)}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
                    activeSeason === season
                      ? "bg-[var(--zen-frost)] text-[var(--zen-void)]"
                      : "bg-white/8 text-white/70 hover:bg-white/12",
                  )}
                >
                  Season {season}
                </button>
              ))}
            </div>

            <ul className="flex flex-col gap-2">
              {(episodesBySeason.map.get(activeSeason ?? "") ?? []).map((ep) => {
                const downloading = downloadBusyUrl === ep.playUrl;
                return (
                  <li key={ep.playUrl}>
                    <div className="flex items-center gap-2 rounded-[22px] border border-white/[0.1] bg-white/[0.05] pr-2 transition-colors hover:bg-white/[0.08]">
                      <button
                        type="button"
                        disabled={playBusy || Boolean(downloadBusyUrl)}
                        onClick={() => void playEpisode(ep, ep.index)}
                        className="group flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] disabled:opacity-50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-[13px] font-semibold text-white/82 group-hover:bg-white/16">
                          {ep.episodeNum || "·"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold text-white">
                            {formatEpisodeCode(ep.season, ep.episodeNum)}
                            {ep.title ? ` · ${ep.title}` : ""}
                          </span>
                          {ep.durationSeconds ? (
                            <span className="mt-0.5 block text-[12px] text-white/40">
                              {Math.round(ep.durationSeconds / 60)} min
                            </span>
                          ) : null}
                        </span>
                        <Play className="h-4 w-4 shrink-0 text-white/35 group-hover:text-white/70" />
                      </button>
                      <button
                        type="button"
                        disabled={playBusy || Boolean(downloadBusyUrl)}
                        aria-label={`Download ${formatEpisodeCode(ep.season, ep.episodeNum)}`}
                        title="Download"
                        onClick={() => void downloadEpisode(ep, ep.index)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/40 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] disabled:opacity-50"
                      >
                        {downloading ? (
                          <ZendeSpinner size="tiny" label="Preparing download" />
                        ) : (
                          <Download className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
