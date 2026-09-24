"use client";

import { Button } from "@appica/ui-react/button";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, Clock3, Download, Play, Star } from "lucide-react";

import { Card } from "@appica/ui-react/card";
import { MediaCastRail, MediaMetadataFacts } from "@/components/library/media-metadata-sections";
import {
  BROWSE_BOTTOM_PAD_MOBILE,
  BROWSE_CONTAINER_CLASS,
  BROWSE_TOP_PAD,
} from "@/components/layout/browse-page-shell";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ShareMediaButton } from "@/components/shares/share-media-button";
import { MovieDownloadButton } from "@/components/library/movie-download-button";
import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { ZendeLoadingState } from "@/components/loading/zende-spinner";
import { useSeriesInfo } from "@/features/iptv/use-series-info";
import { buildEpisodeWatchChannel, formatEpisodeCode } from "@/lib/playback/play-episode";
import {
  clearPlaybackPosition,
  playbackProgressRatio,
  resolvePlaybackPosition,
  shouldOfferResume,
} from "@/lib/playback/playback-position";
import { stashResumeDecision } from "@/lib/playback/resume-decision";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { createDownloadUrl } from "@/lib/navigation/watch-url";
import {
  getViewingEntryPosition,
  listTopFrequentChannels,
  subscribeViewingStats,
  type ViewingEntry,
} from "@/lib/watch/viewing-stats";
import { cn } from "@/lib/utils";
import type { MediaShareTarget } from "@/lib/shares/media-share-types";
import { isTvEnvironment } from "@/lib/tv/tv-environment";
import { ResumePlaybackDialog } from "@/components/watch/resume-playback-dialog";

function formatResumeClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  seriesId: string;
  /** Fallback title from catalog when portal info is loading. */
  fallbackTitle?: string;
  fallbackLogo?: string;
  fallbackGroup?: string;
  providerChannelId?: string;
};

function useViewingHistory(): ViewingEntry[] {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => subscribeViewingStats(() => setEpoch((n) => n + 1)), []);
  void epoch;
  return listTopFrequentChannels(200);
}

export function SeriesDetailView({
  seriesId,
  fallbackTitle,
  fallbackLogo,
  fallbackGroup,
  providerChannelId,
}: Props) {
  const { openChannel, navError: watchNavError, clearNavError } = useWatchNavigation();
  const { data, loading, error, reload, episodesBySeason, showTitle, showPlot, showCover, showBackdrop } =
    useSeriesInfo(seriesId, { providerChannelId, title: fallbackTitle });
  const history = useViewingHistory();
  const [seasonTab, setSeasonTab] = useState<string | null>(null);
  const [playBusy, setPlayBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [pendingResume, setPendingResume] = useState<{
    episode: (typeof episodesBySeason.flat)[0];
    episodeIndex: number;
    positionSeconds: number;
  } | null>(null);
  const displayPlayError = playError ?? watchNavError;
  const tvMode = isTvEnvironment();

  const metadata = data?.metadata;
  const title = metadata?.title ?? showTitle ?? fallbackTitle ?? "Show";
  const cover = metadata?.posterUrl || showCover || fallbackLogo || "";
  const heroArt = metadata?.backdropUrl || showBackdrop || cover;
  const overview = metadata?.overview || showPlot;
  const groupTitle = fallbackGroup;

  const activeSeason = seasonTab ?? episodesBySeason.seasons[0] ?? null;

  const seriesShareTarget = useMemo<MediaShareTarget | null>(() => {
    if (episodesBySeason.flat.length === 0) return null;
    return {
      kind: "series",
      title,
      ...(cover ? { logo: cover } : {}),
      ...(groupTitle ? { group: groupTitle } : {}),
      ...(overview ? { description: overview } : {}),
      items: episodesBySeason.flat.map((episode, episodeIndex) => {
        const channel = buildEpisodeWatchChannel({
          seriesId,
          seriesTitle: title,
          cover: cover || undefined,
          groupTitle,
          episode,
          episodeIndex,
          imdbId: metadata?.imdbId,
          tmdbId: metadata?.tmdbId,
          year: metadata?.year,
          allEpisodes: episodesBySeason.flat,
        });
        return {
          id: `episode-${episodeIndex}`,
          title: episode.title || formatEpisodeCode(episode.season, episode.episodeNum),
          subtitle: formatEpisodeCode(episode.season, episode.episodeNum),
          url: episode.playUrl,
          playback: channel.playback,
        };
      }),
    };
  }, [cover, episodesBySeason.flat, groupTitle, metadata?.imdbId, metadata?.tmdbId, metadata?.year, overview, seriesId, title]);

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
  }, [episodesBySeason, history]);

  const primaryEpisode = continueTarget?.ep ?? episodesBySeason.flat[0] ?? null;
  const primaryEpisodeIndex = primaryEpisode
    ? episodesBySeason.flat.findIndex((episode) => episode.playUrl === primaryEpisode.playUrl)
    : -1;
  const primaryEpisodeChannel = primaryEpisode
    ? buildEpisodeWatchChannel({
        seriesId,
        seriesTitle: title,
        cover: cover || undefined,
        groupTitle,
        episode: primaryEpisode,
        episodeIndex: Math.max(0, primaryEpisodeIndex),
        imdbId: metadata?.imdbId,
        tmdbId: metadata?.tmdbId,
        year: metadata?.year,
        allEpisodes: episodesBySeason.flat,
      })
    : null;
  const favoriteSeriesChannel = {
    url: `zende://series/${encodeURIComponent(data?.seriesId ?? seriesId)}`,
    name: title,
    ...(cover ? { tvgLogo: cover } : {}),
    ...(groupTitle ? { groupTitle } : {}),
  };

  const launchEpisode = useCallback(
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
          imdbId: metadata?.imdbId,
          tmdbId: metadata?.tmdbId,
          year: metadata?.year,
          allEpisodes: episodesBySeason.flat,
        });
        openChannel(channel);
      } catch (err) {
        setPlayError(err instanceof Error ? err.message : "Could not start playback.");
      } finally {
        setPlayBusy(false);
      }
    },
    [clearNavError, cover, episodesBySeason, groupTitle, metadata?.imdbId, metadata?.tmdbId, metadata?.year, openChannel, seriesId, title],
  );

  const playEpisode = useCallback(
    (episode: (typeof episodesBySeason.flat)[0], episodeIndex: number) => {
      const saved = resolvePlaybackPosition(
        [episode.playUrl],
        getViewingEntryPosition(episode.playUrl),
      );
      if (shouldOfferResume(saved)) {
        setPendingResume({
          episode,
          episodeIndex,
          positionSeconds: saved!,
        });
        return;
      }
      launchEpisode(episode, episodeIndex);
    },
    [launchEpisode],
  );

  const handleResumeContinue = useCallback(() => {
    if (!pendingResume) return;
    stashResumeDecision({
      choice: "continue",
      positionSeconds: pendingResume.positionSeconds,
      url: pendingResume.episode.playUrl,
    });
    const next = pendingResume;
    setPendingResume(null);
    launchEpisode(next.episode, next.episodeIndex);
  }, [launchEpisode, pendingResume]);

  const handleResumeStartOver = useCallback(() => {
    if (!pendingResume) return;
    clearPlaybackPosition(pendingResume.episode.playUrl);
    stashResumeDecision({
      choice: "start-over",
      url: pendingResume.episode.playUrl,
    });
    const next = pendingResume;
    setPendingResume(null);
    launchEpisode(next.episode, next.episodeIndex);
  }, [launchEpisode, pendingResume]);

  const downloadPrimaryEpisode = useCallback(async () => {
    if (!primaryEpisodeChannel || !primaryEpisode) return;
    setDownloadBusy(true);
    setPlayError(null);
    try {
      const href = await createDownloadUrl({
        ...primaryEpisodeChannel,
        name: `${title} · ${formatEpisodeCode(primaryEpisode.season, primaryEpisode.episodeNum)} · ${primaryEpisode.title}`,
      });
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (reason) {
      setPlayError(reason instanceof Error ? reason.message : "Could not prepare download.");
    } finally {
      setDownloadBusy(false);
    }
  }, [primaryEpisode, primaryEpisodeChannel, title]);

  const continueProgress = continueTarget
    ? playbackProgressRatio(
        resolvePlaybackPosition(
          [continueTarget.ep.playUrl],
          getViewingEntryPosition(continueTarget.ep.playUrl),
        ),
        continueTarget.ep.durationSeconds,
      )
    : null;

  return (
    <main
      id="main"
      className={cn(
        "tv-media-detail tv-series-detail bg-background min-h-screen text-foreground-intense",
        BROWSE_TOP_PAD,
        BROWSE_BOTTOM_PAD_MOBILE,
        "md:pb-16",
      )}
    >
      <div className="tv-media-detail-hero relative overflow-hidden">
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
            <div className="absolute inset-0 bg-background backdrop-blur-[2px]" />
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />

        <div className={cn(BROWSE_CONTAINER_CLASS, "tv-media-detail-content relative pb-8 pt-4 sm:pt-8")}>
          <Button
            variant="ghost"
            render={<Link href="/library?tab=series" />}
            className="mb-6 rounded-full"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Library
          </Button>

          <div className="tv-media-detail-layout flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="tv-media-detail-poster mx-auto w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-background shadow-lg sm:mx-0 sm:w-52">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={secureImageUrl(cover, undefined, "poster")} alt="" className="aspect-[2/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-background-muted text-[13px] text-foreground-intense">
                  No art
                </div>
              )}
            </div>

            <div className="tv-media-detail-copy min-w-0 flex-1 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                TV Show
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground-intense mt-3">
                {title}
              </h1>
              {groupTitle ? (
                <p className="mt-2 text-[14px] text-foreground-intense">{groupTitle}</p>
              ) : null}
              {metadata ? (
                <div className="mt-4"><MediaMetadataFacts metadata={metadata} /></div>
              ) : null}
              {overview ? (
                <p className="tv-media-detail-overview text-sm text-foreground-muted mt-4 max-w-3xl">
                  {overview}
                </p>
              ) : null}

              <div
                id="media-detail-actions"
                data-tv-layout="horizontal"
                data-tv-nav-down="#series-season-tabs"
                className="tv-media-detail-actions mt-6 flex flex-wrap items-center justify-center gap-3 sm:justify-start"
              >
                {continueTarget ? (
                  <Button variant="primary"
                    data-tv-initial-focus
                    type="button"
                    disabled={playBusy}
                    onClick={() => void playEpisode(continueTarget.ep, continueTarget.index)}
                    className="h-auto rounded-full py-3 px-6 shadow-md transition-all hover:scale-[1.02]"
                  >
                    <span className="flex min-w-[10rem] flex-col items-start gap-1 text-left">
                      <span className="flex items-center gap-2 text-[15px] font-bold">
                        <Play className="h-4 w-4 fill-current" aria-hidden />
                        Continue
                      </span>
                      <span className="text-[13px] font-medium opacity-90">
                        {formatEpisodeCode(
                          continueTarget.ep.season,
                          continueTarget.ep.episodeNum,
                        )}
                        {continueTarget.ep.title ? ` · ${continueTarget.ep.title}` : ""}
                      </span>
                      {continueProgress != null ? (
                        <span className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/20">
                          <span
                            className="block h-full rounded-full bg-white"
                            style={{ width: `${continueProgress * 100}%` }}
                          />
                        </span>
                      ) : null}
                    </span>
                  </Button>
                ) : episodesBySeason.flat[0] ? (
                  <Button variant="primary"
                    data-tv-initial-focus
                    type="button"
                    disabled={playBusy || loading}
                    onClick={() => void playEpisode(episodesBySeason.flat[0]!, 0)}
                    className="h-auto rounded-full py-3 px-6 shadow-md transition-all hover:scale-[1.02]"
                  >
                    <span className="flex items-center gap-2 text-[15px] font-bold">
                      <Play className="h-4 w-4 fill-current" aria-hidden />
                      Play S{episodesBySeason.flat[0]!.season}E
                      {episodesBySeason.flat[0]!.episodeNum || "1"}
                    </span>
                  </Button>
                ) : null}
                {seriesShareTarget ? (
                  <ShareMediaButton target={seriesShareTarget} size="lg" showLabel />
                ) : null}
                <FavoriteStarButton channel={favoriteSeriesChannel} size="md" showLabel />
                {primaryEpisodeChannel ? (
                  <Button
                    data-tv-download
                    variant="secondary"
                    size="lg"
                    type="button"
                    disabled={downloadBusy}
                    onClick={() => void downloadPrimaryEpisode()}
                    className="h-auto rounded-full py-3 px-6"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    {downloadBusy ? "Preparing…" : "Download"}
                  </Button>
                ) : null}
                {primaryEpisodeChannel ? (
                  <MovieDownloadButton
                    channel={{
                      ...primaryEpisodeChannel,
                      name: `${title} · ${formatEpisodeCode(primaryEpisode!.season, primaryEpisode!.episodeNum)} · ${primaryEpisode!.title}`,
                    }}
                    size="lg"
                    showLabel
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={cn(BROWSE_CONTAINER_CLASS, "tv-series-content pb-28 md:pb-16")}>
        {displayPlayError ? (
          <NavErrorBanner
            message={displayPlayError}
            onDismiss={() => {
              setPlayError(null);
              clearNavError();
            }}
          />
        ) : null}

        {metadata ? <MediaCastRail metadata={metadata} /> : null}

        {loading ? (
          <ZendeLoadingState className="py-12" size="large" label="Loading seasons…" />
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-[15px] text-error-strong">{error}</p>
            <Button variant="secondary" type="button" onClick={() => void reload()} className="rounded-full px-6">
              Try again
            </Button>
          </div>
        ) : episodesBySeason.seasons.length === 0 ? (
          <p className="py-12 text-center text-[15px] text-foreground-intense">No episodes found.</p>
        ) : (
          <>
            <section aria-labelledby="episodes-heading" className="mt-4">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-strong">Watch the series</p>
                  <h2 id="episodes-heading" className="mt-1 text-3xl font-bold tracking-tight text-white">Episodes</h2>
                  <p className="mt-1 text-sm text-white/55">
                    Season {activeSeason} · {(episodesBySeason.map.get(activeSeason ?? "") ?? []).length} episodes
                  </p>
                </div>
                <div
                  id="series-season-tabs"
                  data-tv-layout="horizontal"
                  data-tv-nav-up="#media-detail-actions"
                  data-tv-nav-down="#series-episode-grid"
                  className="tv-season-tabs flex max-w-full gap-2 overflow-x-auto p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  aria-label="Choose season"
                >
                  {episodesBySeason.seasons.map((season) => (
                    <Button
                      variant={activeSeason === season ? "primary" : "secondary"}
                      key={season}
                      type="button"
                      aria-pressed={activeSeason === season}
                      onClick={() => setSeasonTab(season)}
                      className={cn(
                        "shrink-0 rounded-full px-6 py-3 text-[14px] font-bold transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        activeSeason === season ? "shadow-[0_0_28px_rgba(236,72,153,.24)]" : "border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      Season {season}
                    </Button>
                  ))}
                </div>
              </div>

              <ul
                id="series-episode-grid"
                data-tv-layout="grid"
                data-tv-columns="1"
                data-tv-nav-up="#series-season-tabs"
                className="tv-episode-grid grid grid-cols-1 gap-4 xl:grid-cols-2"
              >
              {(episodesBySeason.map.get(activeSeason ?? "") ?? []).map((ep, episodeUiIndex) => {
                const episodeIndex = episodesBySeason.flat.findIndex(
                  (candidate) => candidate.playUrl === ep.playUrl,
                );
                return (
                  <li key={ep.playUrl} data-tv-index={episodeUiIndex}>
                    <Card frame="solid" className="tv-episode-card group h-full overflow-hidden border-white/10 bg-[#111722] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_18px_48px_rgba(0,0,0,.3)]">
                        <Button
                          variant="ghost"
                          data-tv-card
                          type="button"
                          disabled={playBusy}
                          onClick={() => void playEpisode(ep, episodeIndex >= 0 ? episodeIndex : ep.index)}
                          aria-label={`Play ${formatEpisodeCode(ep.season, ep.episodeNum)}${ep.title ? `, ${ep.title}` : ""}`}
                          className="tv-episode-play grid h-full min-h-[150px] w-full grid-cols-[220px_minmax(0,1fr)_auto] items-center gap-5 rounded-xl p-3 text-left text-white outline-none hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-primary max-md:grid-cols-[132px_minmax(0,1fr)]"
                        >
                          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gradient-to-br from-slate-700 to-slate-950">
                            {ep.artworkUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={secureImageUrl(ep.artworkUrl)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                            ) : cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={secureImageUrl(cover)} alt="" className="h-full w-full object-cover opacity-55" />
                            ) : null}
                            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                            <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2 py-1 text-xs font-extrabold tracking-wide">
                              {formatEpisodeCode(ep.season, ep.episodeNum)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-[18px] font-bold leading-tight text-white">
                              {ep.episodeNum ? `${ep.episodeNum}. ` : ""}{ep.title || `Episode ${ep.episodeNum || ""}`}
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-white/55">
                              {ep.durationSeconds ? <span className="flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden />{Math.round(ep.durationSeconds / 60)} min</span> : null}
                              {ep.airDate ? <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />{ep.airDate}</span> : null}
                              {ep.rating ? <span className="flex items-center gap-1.5"><Star className="size-3.5 fill-current" aria-hidden />{ep.rating.toFixed(1)}</span> : null}
                            </span>
                            {ep.overview ? <span className="mt-3 line-clamp-2 block text-[14px] leading-relaxed text-white/65">{ep.overview}</span> : null}
                          </div>
                          <span className="mr-2 flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform group-hover:scale-105 max-md:hidden">
                            <Play className="size-5 fill-current" aria-hidden />
                          </span>
                        </Button>
                    </Card>
                  </li>
                );
              })}
              </ul>
            </section>
          </>
        )}
      </div>

      {pendingResume ? (
        <ResumePlaybackDialog
          open
          title={
            pendingResume.episode.title ||
            formatEpisodeCode(pendingResume.episode.season, pendingResume.episode.episodeNum)
          }
          positionSeconds={pendingResume.positionSeconds}
          tvMode={tvMode}
          formatClock={formatResumeClock}
          onContinue={handleResumeContinue}
          onStartOver={handleResumeStartOver}
        />
      ) : null}
    </main>
  );
}
