"use client";

import { Button } from "@appica/ui-react/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@appica/ui-react/card";
import { Progress } from "@appica/ui-react/progress";
import { ChevronLeft, Download, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  BROWSE_BOTTOM_PAD_MOBILE,
  BROWSE_CONTAINER_CLASS,
  BROWSE_TOP_PAD,
} from "@/components/layout/browse-page-shell";
import { MediaCastRail, MediaMetadataFacts } from "@/components/library/media-metadata-sections";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ShareMediaButton } from "@/components/shares/share-media-button";
import { MovieDownloadButton } from "@/components/library/movie-download-button";
import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { ZendeLoadingState } from "@/components/loading/zende-spinner";
import { useMovieInfo } from "@/features/iptv/use-movie-info";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { createDownloadUrl } from "@/lib/navigation/watch-url";
import {
  clearPlaybackPosition,
  playbackProgressRatio,
  resolvePlaybackPosition,
  shouldOfferResume,
} from "@/lib/playback/playback-position";
import { stashResumeDecision } from "@/lib/playback/resume-decision";
import {
  getViewingEntryPosition,
  subscribeViewingStats,
} from "@/lib/watch/viewing-stats";
import { cn } from "@/lib/utils";
import { mediaShareTargetForChannel } from "@/lib/shares/share-target";
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
  movieId: string;
  fallbackTitle?: string;
  fallbackLogo?: string;
  fallbackGroup?: string;
};

export function MovieDetailView({ movieId, fallbackTitle, fallbackLogo, fallbackGroup }: Props) {
  const { data, loading, error, reload } = useMovieInfo(movieId, fallbackTitle);
  const { playChannel, navError, clearNavError } = useWatchNavigation();
  const [historyRevision, setHistoryRevision] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [resumeChoiceOpen, setResumeChoiceOpen] = useState(false);
  const startMovieButtonRef = useRef<HTMLButtonElement>(null);
  const tvMode = isTvEnvironment();

  useEffect(() => subscribeViewingStats(() => setHistoryRevision((value) => value + 1)), []);

  const metadata = data?.metadata;
  const title = metadata?.title || data?.channel.name || fallbackTitle || "Movie";
  const poster = metadata?.posterUrl || data?.channel.tvgLogo || fallbackLogo || "";
  const backdrop = metadata?.backdropUrl || poster;
  const durationSeconds =
    data?.durationSeconds ??
    (metadata?.runtimeMinutes ? metadata.runtimeMinutes * 60 : undefined);
  void historyRevision;
  const position = data?.channel.url
    ? resolvePlaybackPosition(
        [data.channel.url],
        getViewingEntryPosition(data.channel.url),
      )
    : null;
  const progress = playbackProgressRatio(position, durationSeconds ?? undefined);

  const playbackChannel = data?.channel
    ? {
      ...data.channel,
      name: title,
      ...(poster ? { tvgLogo: poster } : {}),
      groupTitle: data.channel.groupTitle ?? fallbackGroup,
      playback: {
        contentKind: "movie" as const,
        displayTitle: title,
        ...(durationSeconds ? { durationSeconds } : {}),
        searchTitle: title,
        ...(metadata?.year ? { year: metadata.year, displaySubtitle: metadata.year } : {}),
        ...(metadata?.imdbId ? { imdbId: metadata.imdbId } : {}),
      },
      }
    : null;
  const shareTarget = playbackChannel
    ? mediaShareTargetForChannel(playbackChannel)
    : null;
  const playbackUrl = playbackChannel?.url;

  useEffect(() => {
    if (!playbackUrl || !tvMode) return;
    const frame = window.requestAnimationFrame(() => {
      startMovieButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [playbackUrl, tvMode]);

  function launchPlayback() {
    if (!playbackChannel) return;
    setActionError(null);
    clearNavError();
    playChannel(playbackChannel);
  }

  function startPlayback() {
    if (!playbackChannel) return;
    if (shouldOfferResume(position)) {
      setResumeChoiceOpen(true);
      return;
    }
    launchPlayback();
  }

  function handleResumeContinue() {
    if (position != null) {
      stashResumeDecision({
        choice: "continue",
        positionSeconds: position,
        ...(playbackChannel?.url ? { url: playbackChannel.url } : {}),
      });
    }
    setResumeChoiceOpen(false);
    launchPlayback();
  }

  function handleResumeStartOver() {
    if (playbackChannel?.url) clearPlaybackPosition(playbackChannel.url);
    stashResumeDecision({
      choice: "start-over",
      ...(playbackChannel?.url ? { url: playbackChannel.url } : {}),
    });
    setResumeChoiceOpen(false);
    launchPlayback();
  }

  async function downloadMovie() {
    if (!playbackChannel) return;
    setDownloadBusy(true);
    setActionError(null);
    try {
      const href = await createDownloadUrl(playbackChannel);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Could not prepare download.");
    } finally {
      setDownloadBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <main className={cn("min-h-screen bg-background", BROWSE_TOP_PAD)}>
        <ZendeLoadingState className="py-32" size="large" label="Building movie details…" />
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className={cn("min-h-screen bg-background", BROWSE_TOP_PAD, BROWSE_BOTTOM_PAD_MOBILE)}>
        <div className={cn(BROWSE_CONTAINER_CLASS, "py-10")}>
          <Card frame="solid" className="mx-auto max-w-xl border-border">
            <CardHeader>
              <CardTitle>Movie details are unavailable</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <div className="flex gap-2 px-5 pb-5">
              <Button render={<Link href="/library?tab=movie" />} variant="secondary">
                Back to movies
              </Button>
              <Button onClick={() => void reload()}>Try again</Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main"
      className={cn(
        "tv-media-detail tv-movie-detail min-h-screen bg-background text-foreground-intense",
        BROWSE_TOP_PAD,
        BROWSE_BOTTOM_PAD_MOBILE,
        "md:pb-16",
      )}
    >
      <section className="tv-media-detail-hero relative isolate min-h-[36rem] overflow-hidden">
        {backdrop ? (
          <div className="absolute inset-0 -z-20" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={secureImageUrl(backdrop)} alt="" className="size-full object-cover opacity-55" />
          </div>
        ) : null}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/90 to-background/30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-transparent to-background/20" />

        <div className={cn(BROWSE_CONTAINER_CLASS, "tv-media-detail-content pb-12 pt-4 sm:pt-8")}>
          <Button
            variant="ghost"
            render={<Link href="/library?tab=movie" />}
            className="mb-8 rounded-full"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Movies
          </Button>

          <div className="tv-media-detail-layout grid items-end gap-7 md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
            <Card frame="glass" inset={false} className="tv-media-detail-poster mx-auto w-44 overflow-hidden border-border shadow-2xl md:mx-0 md:w-full">
              {poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={secureImageUrl(poster, undefined, "poster")} alt="" className="aspect-[2/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-background-muted p-6 text-center text-sm">
                  {title}
                </div>
              )}
            </Card>

            <div className="tv-media-detail-copy min-w-0 text-center md:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-strong">Movie</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              {metadata?.tagline ? (
                <p className="mt-3 text-base italic text-foreground-muted">{metadata.tagline}</p>
              ) : null}
              {metadata ? <div className="mt-5"><MediaMetadataFacts metadata={metadata} /></div> : null}
              {metadata?.overview ? (
                <p className="tv-media-detail-overview mx-auto mt-5 max-w-3xl text-sm leading-6 text-foreground-muted md:mx-0 md:text-base">
                  {metadata.overview}
                </p>
              ) : null}

              <div
                id="media-detail-actions"
                data-tv-layout="horizontal"
                className="tv-media-detail-actions mt-7 flex flex-wrap justify-center gap-3 md:justify-start"
              >
                <Button
                  ref={startMovieButtonRef}
                  data-tv-initial-focus
                  size="lg"
                  onClick={startPlayback}
                  disabled={!playbackChannel}
                  className="min-w-44 rounded-full"
                >
                  <Play className="size-4 fill-current" aria-hidden />
                  {progress != null ? "Continue" : "Start movie"}
                </Button>
                {playbackChannel ? <FavoriteStarButton channel={playbackChannel} size="md" showLabel /> : null}
                {shareTarget ? (
                  <ShareMediaButton target={shareTarget} size="lg" showLabel />
                ) : null}
                {playbackChannel ? (
                  <Button
                    data-tv-download
                    size="lg"
                    variant="secondary"
                    onClick={() => void downloadMovie()}
                    disabled={downloadBusy}
                    className="min-w-44 rounded-full"
                  >
                    <Download className="size-4" aria-hidden />
                    {downloadBusy ? "Preparing…" : "Download"}
                  </Button>
                ) : null}
                {playbackChannel ? <MovieDownloadButton channel={playbackChannel} size="lg" showLabel /> : null}
              </div>
              {progress != null ? (
                <div className="mx-auto mt-4 max-w-md text-left md:mx-0">
                  <div className="mb-1.5 flex justify-between text-xs text-foreground-muted">
                    <span>{Math.round((position ?? 0) / 60)} min watched</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <Progress value={progress * 100} aria-label="Movie playback progress" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className={cn(BROWSE_CONTAINER_CLASS, "pb-24")}>
        {actionError || navError ? (
          <NavErrorBanner
            message={actionError || navError || "Could not start playback."}
            onDismiss={() => {
              setActionError(null);
              clearNavError();
            }}
          />
        ) : null}
        {metadata ? <MediaCastRail metadata={metadata} /> : null}
      </div>

      {resumeChoiceOpen && position != null ? (
        <ResumePlaybackDialog
          open
          title={title}
          positionSeconds={position}
          tvMode={tvMode}
          formatClock={formatResumeClock}
          onContinue={handleResumeContinue}
          onStartOver={handleResumeStartOver}
        />
      ) : null}
    </main>
  );
}
