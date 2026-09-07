"use client";

import { Button } from "@appica/ui-react/button";
import { Card } from "@appica/ui-react/card";
import { Slider } from "@appica/ui-react/slider";
import {
  EyeOff,
  FastForward,
  Pause,
  Play,
  Rewind,
  Search,
  Subtitles,
  TvMinimal,
  Unplug,
  X,
} from "lucide-react";
import { useState } from "react";

import { SubtitleSearchPanel } from "@/components/watch/subtitle-search-panel";
import type {
  RemotePlaybackState,
  RemoteSubtitleTrack,
} from "@/lib/remote/remote-control-types";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const s = String(total % 60).padStart(2, "0");
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${s}`
    : `${m}:${s}`;
}

export function MobileRemotePlayerController({
  open,
  deviceLabel,
  devicePath,
  playback,
  pendingTitle,
  onClose,
  onTogglePlay,
  onSkip,
  onSeek,
  onSubtitleTrack,
  onSubtitleOff,
  onDisconnect,
}: {
  open: boolean;
  deviceLabel: string;
  devicePath: string;
  playback: RemotePlaybackState | null;
  pendingTitle: string | null;
  onClose: () => void;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onSubtitleTrack: (track: RemoteSubtitleTrack) => void;
  onSubtitleOff: () => void;
  onDisconnect: () => void;
}) {
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [subtitleSearchOpen, setSubtitleSearchOpen] = useState(false);
  const [remoteSubtitleTrack, setRemoteSubtitleTrack] = useState<RemoteSubtitleTrack | null>(null);
  const [subtitleVisible, setSubtitleVisible] = useState(false);

  if (!open) return null;

  const duration = playback?.duration ?? 0;
  const canSeek = Boolean(playback?.seekable && duration > 0);
  const sliderValue = Math.min(duration || Number.MAX_SAFE_INTEGER, Math.max(
    0,
    seekPreview ?? playback?.currentTime ?? 0,
  ));
  const title = playback?.title || pendingTitle;
  const canSearchSubtitles = Boolean(
    playback?.active &&
      (playback.contentKind === "movie" || playback.contentKind === "episode"),
  );

  return (
    <>
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-background/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="TV remote control"
    >
      <Card frame="solid" className="w-full max-w-md overflow-hidden rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-strong">
              <TvMinimal className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground-intense">{deviceLabel}</p>
              <p className="truncate text-xs text-foreground-muted">
                {playback?.active ? "Now controlling TV playback" : `TV is on ${devicePath}`}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-md" type="button" onClick={onClose} aria-label="Close remote">
            <X className="size-5" aria-hidden />
          </Button>
        </div>

        <div className="p-4">
          {title ? (
            <div className="flex items-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background-muted">
                {playback?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- provider artwork is remote and variable
                  <img src={playback.logo} alt="" className="size-full object-contain p-1.5" />
                ) : (
                  <Play className="size-5 text-foreground-muted" aria-hidden />
                )}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-base font-semibold leading-tight text-foreground-intense">
                  {title}
                </p>
                <p className="mt-1 text-xs text-foreground-muted">
                  {playback
                    ? playback.contentKind === "live"
                      ? playback.buffering ? "Live · Buffering" : "Live"
                      : playback.buffering ? "Buffering on TV" : playback.playing ? "Playing on TV" : "Paused on TV"
                    : "Starting on TV…"}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background-muted px-4 py-5 text-center">
              <p className="text-sm font-semibold text-foreground-intense">Remote is ready</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                Browse on your phone and choose a channel, movie, or episode to play it on the TV.
              </p>
            </div>
          )}

          {playback?.active ? (
            <div className="mt-5">
              {canSeek ? (
                <>
                  <Slider
                    aria-label="TV playback position"
                    min={0}
                    max={duration}
                    step={1}
                    value={[sliderValue]}
                    onValueChange={(value) => {
                      const next = Array.isArray(value) ? value[0] : value;
                      if (typeof next === "number") setSeekPreview(next);
                    }}
                    onValueCommitted={(value) => {
                      const next = Array.isArray(value) ? value[0] : value;
                      if (typeof next === "number") onSeek(next);
                      setSeekPreview(null);
                    }}
                    tooltipVisibility="never"
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-xs tabular-nums text-foreground-muted">
                    <span>{formatClock(sliderValue)}</span>
                    <span>{formatClock(duration)}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-success-strong">
                  <span className="size-2 rounded-full bg-success" aria-hidden />
                  Live on TV
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  type="button"
                  disabled={!canSeek}
                  onClick={() => onSkip(-15)}
                  aria-label="Back 15 seconds"
                >
                  <Rewind className="size-5" aria-hidden />
                </Button>
                <Button size="lg" type="button" onClick={onTogglePlay} aria-label={playback.playing ? "Pause TV" : "Play TV"}>
                  {playback.playing ? <Pause className="size-5" fill="currentColor" aria-hidden /> : <Play className="size-5" fill="currentColor" aria-hidden />}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  type="button"
                  disabled={!canSeek}
                  onClick={() => onSkip(15)}
                  aria-label="Forward 15 seconds"
                >
                  <FastForward className="size-5" aria-hidden />
                </Button>
              </div>

              {canSearchSubtitles ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Button
                    variant="secondary"
                    size="lg"
                    type="button"
                    onClick={() => setSubtitleSearchOpen(true)}
                  >
                    <Search className="size-5" aria-hidden />
                    Find subtitles
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    type="button"
                    disabled={!remoteSubtitleTrack}
                    onClick={() => {
                      if (!remoteSubtitleTrack) return;
                      if (subtitleVisible) {
                        onSubtitleOff();
                        setSubtitleVisible(false);
                      } else {
                        onSubtitleTrack(remoteSubtitleTrack);
                        setSubtitleVisible(true);
                      }
                    }}
                  >
                    {subtitleVisible ? (
                      <EyeOff className="size-5" aria-hidden />
                    ) : (
                      <Subtitles className="size-5" aria-hidden />
                    )}
                    {subtitleVisible ? "Hide subtitles" : "Show subtitles"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <Button
            variant="ghost"
            type="button"
            onClick={onDisconnect}
            className="mt-5 w-full text-danger-strong"
          >
            <Unplug className="size-4" aria-hidden />
            Stop controlling this TV
          </Button>
        </div>
      </Card>
    </div>
    {canSearchSubtitles && title ? (
      <SubtitleSearchPanel
        open={subtitleSearchOpen}
        onClose={() => setSubtitleSearchOpen(false)}
        title={title}
        playback={playback?.subtitleSearch}
        onSelect={(track) => {
          setRemoteSubtitleTrack(track);
          setSubtitleVisible(true);
          onSubtitleTrack(track);
        }}
      />
    ) : null}
    </>
  );
}
