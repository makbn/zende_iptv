"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, Play } from "lucide-react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { useSeriesInfo } from "@/features/iptv/use-series-info";
import { buildEpisodeWatchChannel, formatEpisodeCode } from "@/lib/playback/play-episode";
import {
  getPlaybackPosition,
  playbackProgressRatio,
} from "@/lib/playback/playback-position";
import { createWatchUrl } from "@/lib/navigation/watch-url";
import {
  listTopFrequentChannels,
  subscribeViewingStats,
  type ViewingEntry,
} from "@/lib/watch/viewing-stats";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";

type Props = {
  seriesId: string;
  /** Fallback title from catalog when portal info is loading. */
  fallbackTitle?: string;
  fallbackLogo?: string;
  fallbackGroup?: string;
};

function useViewingHistory(): ViewingEntry[] {
  return useSyncExternalStore(
    subscribeViewingStats,
    () => listTopFrequentChannels(200),
    () => [],
  );
}

export function SeriesDetailView({
  seriesId,
  fallbackTitle,
  fallbackLogo,
  fallbackGroup,
}: Props) {
  const router = useRouter();
  const { loading, error, episodesBySeason, showTitle, showPlot, showCover } =
    useSeriesInfo(seriesId);
  const history = useViewingHistory();
  const [seasonTab, setSeasonTab] = useState<string | null>(null);
  const [playBusy, setPlayBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const title = showTitle ?? fallbackTitle ?? "Show";
  const cover = showCover || fallbackLogo || "";
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
    async (episode: (typeof episodesBySeason.flat)[0], episodeIndex: number) => {
      setPlayBusy(true);
      setPlayError(null);
      try {
        const channel = buildEpisodeWatchChannel({
          seriesId,
          seriesTitle: title,
          cover: cover || undefined,
          groupTitle,
          episode,
          episodeIndex,
        });
        const href = await createWatchUrl(channel);
        router.push(href);
      } catch (err) {
        setPlayError(err instanceof Error ? err.message : "Could not start playback.");
      } finally {
        setPlayBusy(false);
      }
    },
    [seriesId, title, cover, groupTitle, router],
  );

  const continueProgress = continueTarget
    ? playbackProgressRatio(
        getPlaybackPosition(continueTarget.ep.playUrl),
        continueTarget.ep.durationSeconds,
      )
    : null;

  return (
    <div className="min-h-screen bg-[var(--tv-page-bg)] text-white">
      <div className="relative overflow-hidden">
        {cover ? (
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center opacity-35 blur-2xl"
            style={{ backgroundImage: `url(${cover})` }}
            aria-hidden
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[var(--tv-page-bg)] to-[var(--tv-page-bg)]" />

        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-8">
          <Link
            href="/library?tab=series"
            className="mb-6 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[14px] text-white/65 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Library
          </Link>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl sm:mx-0 sm:w-52">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="aspect-[2/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-white/5 text-[13px] text-white/35">
                  No art
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-white/40">
                TV Show
              </p>
              <h1 className="mt-2 text-[28px] font-bold tracking-tight sm:text-[36px]">
                {title}
              </h1>
              {groupTitle ? (
                <p className="mt-2 text-[14px] text-white/45">{groupTitle}</p>
              ) : null}
              {showPlot ? (
                <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-white/55">
                  {showPlot}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                {continueTarget ? (
                  <button
                    type="button"
                    disabled={playBusy}
                    onClick={() => void playEpisode(continueTarget.ep, continueTarget.index)}
                    className="outline-none disabled:opacity-50"
                  >
                    <ZenedeGlass variant="ctaPill">
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
                    </ZenedeGlass>
                  </button>
                ) : episodesBySeason.flat[0] ? (
                  <button
                    type="button"
                    disabled={playBusy || loading}
                    onClick={() => void playEpisode(episodesBySeason.flat[0]!, 0)}
                    className="outline-none disabled:opacity-50"
                  >
                    <ZenedeGlass variant="ctaPill">
                      <span className="flex items-center gap-2 px-6 py-3 text-[15px] font-semibold text-zinc-950">
                        <Play className="h-4 w-4 fill-current" aria-hidden />
                        Play S{episodesBySeason.flat[0]!.season}E
                        {episodesBySeason.flat[0]!.episodeNum || "1"}
                      </span>
                    </ZenedeGlass>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        {playError ? <NavErrorBanner message={playError} onDismiss={() => setPlayError(null)} /> : null}

        {loading ? (
          <p className="py-12 text-center text-[15px] text-white/45">Loading seasons…</p>
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
                    "shrink-0 rounded-full px-4 py-2 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white",
                    activeSeason === season
                      ? "bg-white text-zinc-950"
                      : "bg-white/8 text-white/70 hover:bg-white/12",
                  )}
                >
                  Season {season}
                </button>
              ))}
            </div>

            <ul className="flex flex-col gap-2">
              {(episodesBySeason.map.get(activeSeason ?? "") ?? []).map((ep) => (
                <li key={ep.playUrl}>
                  <button
                    type="button"
                    disabled={playBusy}
                    onClick={() => void playEpisode(ep, ep.index)}
                    className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left outline-none transition-colors hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-[13px] font-semibold text-white/80 group-hover:bg-white/15">
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
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
