"use client";

import { Button } from "@appica/ui-react/button";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Download, Play } from "lucide-react";

import { Card } from "@appica/ui-react/card";
import { MediaCastRail, MediaMetadataFacts } from "@/components/library/media-metadata-sections";
import {
  BROWSE_BOTTOM_PAD_MOBILE,
  BROWSE_CONTAINER_CLASS,
  BROWSE_TOP_PAD,
} from "@/components/layout/browse-page-shell";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ShareMediaButton } from "@/components/shares/share-media-button";
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
import type { MediaShareTarget } from "@/lib/shares/media-share-types";

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
  const { data, loading, error, episodesBySeason, showTitle, showPlot, showCover, showBackdrop } =
    useSeriesInfo(seriesId, { providerChannelId, title: fallbackTitle });
  const history = useViewingHistory();
  const [seasonTab, setSeasonTab] = useState<string | null>(null);
  const [playBusy, setPlayBusy] = useState(false);
  const [downloadBusyUrl, setDownloadBusyUrl] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const displayPlayError = playError ?? watchNavError;

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
  }, [cover, episodesBySeason.flat, groupTitle, overview, seriesId, title]);

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
    [clearNavError, cover, episodesBySeason, groupTitle, openChannel, seriesId, title],
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
    [clearNavError, cover, episodesBySeason, groupTitle, seriesId, title],
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

              <div className="tv-media-detail-actions mt-6 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
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
          <p className="py-12 text-center text-[15px] text-error-strong">{error}</p>
        ) : episodesBySeason.seasons.length === 0 ? (
          <p className="py-12 text-center text-[15px] text-foreground-intense">No episodes found.</p>
        ) : (
          <>
            <div className="tv-season-tabs flex gap-2 overflow-x-auto pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {episodesBySeason.seasons.map((season) => (
                <Button
                  variant={activeSeason === season ? "primary" : "secondary"}
                  key={season}
                  type="button"
                  onClick={() => setSeasonTab(season)}
                  className={cn(
                    "shrink-0 rounded-full px-5 py-2.5 text-[14px] font-semibold transition-all",
                    activeSeason === season ? "shadow-md scale-[1.02]" : "opacity-80 hover:opacity-100"
                  )}
                >
                  Season {season}
                </Button>
              ))}
            </div>

            <ul className="tv-episode-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(episodesBySeason.map.get(activeSeason ?? "") ?? []).map((ep) => {
                const downloading = downloadBusyUrl === ep.playUrl;
                const episodeIndex = episodesBySeason.flat.findIndex(
                  (candidate) => candidate.playUrl === ep.playUrl,
                );
                const episodeChannel = buildEpisodeWatchChannel({
                  seriesId,
                  seriesTitle: title,
                  cover: cover || undefined,
                  groupTitle,
                  episode: ep,
                  episodeIndex: episodeIndex >= 0 ? episodeIndex : ep.index,
                });
                const episodeShareTarget: MediaShareTarget = {
                  kind: "episode",
                  title: episodeChannel.name,
                  ...(cover ? { logo: cover } : {}),
                  ...(groupTitle ? { group: groupTitle } : {}),
                  items: [{
                    id: "main",
                    title: episodeChannel.name,
                    subtitle: formatEpisodeCode(ep.season, ep.episodeNum),
                    url: episodeChannel.url,
                    playback: episodeChannel.playback,
                  }],
                };
                return (
                  <li key={ep.playUrl}>
                    <Card frame="solid" className="tv-episode-card group h-full overflow-hidden transition-all hover:border-primary/50 hover:shadow-md">
                      <div className="flex h-full items-center p-2">
                        <Button variant="ghost"
                          data-tv-download
                          type="button"
                          disabled={playBusy || Boolean(downloadBusyUrl)}
                          onClick={() => void playEpisode(ep, ep.index)}
                          className="flex min-w-0 flex-1 items-center gap-4 rounded-md px-3 py-3 text-left outline-none hover:bg-transparent"
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background-muted text-[15px] font-bold text-foreground-intense group-hover:bg-primary group-hover:text-primary-foreground transition-colors shadow-sm">
                            {ep.episodeNum || "·"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold text-foreground-intense truncate">
                              {formatEpisodeCode(ep.season, ep.episodeNum)}
                              {ep.title ? ` · ${ep.title}` : ""}
                            </span>
                            {ep.durationSeconds ? (
                              <span className="mt-1 block text-[13px] font-medium text-foreground-muted">
                                {Math.round(ep.durationSeconds / 60)} min
                              </span>
                            ) : null}
                          </div>
                        </Button>
                        <ShareMediaButton target={episodeShareTarget} />
                        <Button variant="ghost"
                          type="button"
                          disabled={playBusy || Boolean(downloadBusyUrl)}
                          aria-label={`Download ${formatEpisodeCode(ep.season, ep.episodeNum)}`}
                          title="Download"
                          onClick={() => void downloadEpisode(ep, ep.index)}
                          className="mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-background-muted hover:text-foreground-intense"
                        >
                          {downloading ? (
                            <ZendeSpinner size="tiny" label="Preparing download" />
                          ) : (
                            <Download className="h-5 w-5" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </Card>
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
