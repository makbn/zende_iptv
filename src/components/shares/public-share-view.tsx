"use client";

import { Button } from "@appica/ui-react/button";
import { Card } from "@appica/ui-react/card";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  Film,
  Link2,
  Play,
  Radio,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import type { PublicMediaShare, PublicMediaShareItem } from "@/lib/shares/media-share-types";
import type { PlaybackMode } from "@/lib/stream/playback-url";
import { cn } from "@/lib/utils";

const StreamPlayer = dynamic(
  () => import("@/components/player/stream-player").then((module) => module.StreamPlayer),
  { ssr: false },
);

type Playback = {
  item: PublicMediaShareItem;
  playbackUrl: string;
  playbackMode?: PlaybackMode;
  transcoded?: boolean;
};

function remainingParts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [
    { label: "days", value: days },
    { label: "hours", value: hours },
    { label: "minutes", value: minutes },
    { label: "seconds", value: seconds },
  ];
}

function durationLabel(seconds?: number): string | null {
  if (!seconds) return null;
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes} min`;
}

export function PublicShareView({ token }: { token: string }) {
  const [share, setShare] = useState<PublicMediaShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expiryDialogOpen, setExpiryDialogOpen] = useState(true);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [playbackBusyId, setPlaybackBusyId] = useState<string | null>(null);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shares/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as PublicMediaShare & {
          error?: string;
          expired?: boolean;
        };
        if (!response.ok) {
          if (body.expired) setExpired(true);
          throw new Error(body.error || "This share link is unavailable.");
        }
        if (!cancelled) setShare(body);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "This share link is unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const requestPlayback = useCallback(async (item: PublicMediaShareItem) => {
    setPlaybackBusyId(item.id);
    setActionError(null);
    try {
      const response = await fetch(`/api/shares/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "play", itemId: item.id }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        playbackUrl?: string;
        playbackMode?: PlaybackMode;
        transcoded?: boolean;
        error?: string;
        expired?: boolean;
      };
      if (!response.ok || !body.playbackUrl) {
        if (body.expired) setExpired(true);
        throw new Error(body.error || "Could not start this stream.");
      }
      setPlayback({
        item,
        playbackUrl: body.playbackUrl,
        playbackMode: body.playbackMode,
        transcoded: body.transcoded,
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Could not start this stream.");
    } finally {
      setPlaybackBusyId(null);
    }
  }, [token]);

  useEffect(() => {
    if (!share || share.kind === "series" || autoStartedRef.current) return;
    const first = share.items[0];
    if (!first) return;
    autoStartedRef.current = true;
    queueMicrotask(() => void requestPlayback(first));
  }, [requestPlayback, share]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remainingMs = share ? new Date(share.expiresAt).getTime() - now : 0;
  const hasExpired = expired || Boolean(share && remainingMs <= 0);

  async function downloadItem(item: PublicMediaShareItem) {
    setDownloadBusyId(item.id);
    setActionError(null);
    try {
      const response = await fetch(`/api/shares/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download", itemId: item.id }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        downloadUrl?: string;
        error?: string;
        expired?: boolean;
      };
      if (!response.ok || !body.downloadUrl) {
        if (body.expired) setExpired(true);
        throw new Error(body.error || "Could not start the download.");
      }
      const anchor = document.createElement("a");
      anchor.href = body.downloadUrl;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Could not start the download.");
    } finally {
      setDownloadBusyId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <ZendeLoadingState size="large" label="Opening shared media…" />
      </main>
    );
  }

  if (hasExpired || !share) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 text-center text-foreground-intense">
        <Card frame="solid" className="w-full max-w-md border-border p-8 shadow-2xl">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-background-muted text-foreground-muted">
            <Clock3 className="size-7" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {hasExpired ? "This link has expired" : "Share unavailable"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-foreground-muted">
            {error || "Ask the sender to create a new share link."}
          </p>
        </Card>
      </main>
    );
  }

  const singleItem = share.kind !== "series" ? share.items[0] : null;
  const isLive = share.kind === "live";

  return (
    <main className={cn("min-h-screen bg-background text-foreground-intense", isLive && "fixed inset-0 overflow-hidden")}>
      {isLive ? (
        <>
          <div className="absolute inset-0">
            {playback ? (
              <StreamPlayer
                src={playback.playbackUrl}
                playbackMode={playback.playbackMode}
                controls
                className="size-full"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                {playbackBusyId ? <ZendeLoadingState size="large" label="Tuning live channel…" /> : null}
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-5 pb-16 text-white">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-red-500/90"><Radio className="size-5" aria-hidden /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Live · Shared with you</p>
                <h1 className="truncate text-xl font-semibold">{share.title}</h1>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
          <header className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Link2 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-primary-strong">Shared with you</p>
              <p className="text-sm text-foreground-muted">Powered by Zende</p>
            </div>
          </header>

          <section className="mt-8 overflow-hidden rounded-3xl border border-border bg-background-muted shadow-2xl">
            <div className="relative min-h-64 p-6 sm:p-9">
              {share.logo ? (
                <div className="absolute inset-0 overflow-hidden" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={secureImageUrl(share.logo)} alt="" className="size-full scale-110 object-cover opacity-20 blur-2xl" />
                  <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/60" />
                </div>
              ) : null}
              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
                {share.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={secureImageUrl(share.logo, undefined, "poster")} alt="" className="mx-auto aspect-[2/3] w-36 rounded-2xl object-cover shadow-xl sm:mx-0 sm:w-44" />
                ) : (
                  <span className="mx-auto flex aspect-[2/3] w-36 items-center justify-center rounded-2xl bg-background shadow-xl sm:mx-0 sm:w-44">
                    <Film className="size-10 text-foreground-muted" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-strong">{share.kind === "series" ? "Series" : "Video"}</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">{share.title}</h1>
                  {share.group ? <p className="mt-2 text-sm text-foreground-muted">{share.group}</p> : null}
                  {share.description ? <p className="mt-4 line-clamp-4 max-w-3xl text-sm leading-6 text-foreground-muted">{share.description}</p> : null}
                  {singleItem ? (
                    <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
                      <Button size="lg" onClick={() => void requestPlayback(singleItem)} disabled={playbackBusyId === singleItem.id}>
                        {playbackBusyId === singleItem.id ? <ZendeSpinner size="tiny" label="Preparing playback" /> : <Play className="size-4 fill-current" aria-hidden />}
                        {playback ? "Restart" : "Watch now"}
                      </Button>
                      <Button size="lg" variant="secondary" onClick={() => void downloadItem(singleItem)} disabled={downloadBusyId === singleItem.id}>
                        {downloadBusyId === singleItem.id ? <ZendeSpinner size="tiny" label="Preparing download" /> : <Download className="size-4" aria-hidden />}
                        Download
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {playback ? (
            <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-black shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{playback.item.title}</p>
                  {playback.item.subtitle ? <p className="text-xs text-white/60">{playback.item.subtitle}</p> : null}
                </div>
                {share.kind === "series" ? (
                  <Button variant="ghost" onClick={() => setPlayback(null)} className="text-white">
                    <ArrowLeft className="size-4" aria-hidden /> Back to episodes
                  </Button>
                ) : null}
              </div>
              <div className="aspect-video">
                <StreamPlayer src={playback.playbackUrl} playbackMode={playback.playbackMode} controls className="size-full" />
              </div>
            </section>
          ) : null}

          {share.kind === "series" ? (
            <section className="mt-8 pb-14">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Episodes</h2>
                  <p className="mt-1 text-sm text-foreground-muted">Watch online or download an episode.</p>
                </div>
                <span className="rounded-full bg-background-muted px-3 py-1 text-xs font-medium text-foreground-muted">{share.items.length} episodes</span>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {share.items.map((item) => (
                  <li key={item.id}>
                    <Card frame="solid" className="flex h-full items-center gap-3 border-border p-3">
                      <Button
                        variant="ghost"
                        onClick={() => void requestPlayback(item)}
                        disabled={Boolean(playbackBusyId)}
                        className="flex min-w-0 flex-1 justify-start gap-3 px-2 py-3 text-left"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          {playbackBusyId === item.id ? <ZendeSpinner size="tiny" label="Preparing episode" /> : <Play className="size-4 fill-current" aria-hidden />}
                        </span>
                        <span className="min-w-0">
                          {item.subtitle ? <span className="block text-xs font-semibold uppercase tracking-wide text-primary-strong">{item.subtitle}</span> : null}
                          <span className="block truncate text-sm font-semibold text-foreground-intense">{item.title}</span>
                          {durationLabel(item.durationSeconds) ? <span className="mt-0.5 block text-xs text-foreground-muted">{durationLabel(item.durationSeconds)}</span> : null}
                        </span>
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void downloadItem(item)}
                        disabled={Boolean(downloadBusyId)}
                        aria-label={`Download ${item.title}`}
                        title="Download episode"
                        className="size-10 shrink-0 rounded-full p-0"
                      >
                        {downloadBusyId === item.id ? <ZendeSpinner size="tiny" label="Preparing download" /> : <Download className="size-4" aria-hidden />}
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {actionError ? <p role="alert" className="my-5 rounded-xl border border-error-subtle bg-error-subtle/10 p-4 text-sm text-error-strong">{actionError}</p> : null}
        </div>
      )}

      {isLive && actionError ? (
        <div className="absolute inset-x-4 bottom-5 z-30 mx-auto max-w-lg rounded-xl bg-background p-4 text-center text-sm text-error-strong shadow-2xl">{actionError}</div>
      ) : null}

      {expiryDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" role="presentation">
          <Card frame="solid" role="dialog" aria-modal="true" aria-labelledby="share-expiry-title" className="w-full max-w-lg overflow-hidden border-border shadow-2xl">
            <div className="bg-gradient-to-br from-primary/20 via-background to-background p-6 text-center sm:p-8">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
                <Clock3 className="size-7" aria-hidden />
              </span>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-primary-strong">Time-limited share</p>
              <h2 id="share-expiry-title" className="mt-2 text-2xl font-semibold tracking-tight">This link expires in</h2>
              <div className="mt-6 grid grid-cols-4 gap-2">
                {remainingParts(remainingMs).map((part) => (
                  <div key={part.label} className="rounded-xl border border-border bg-background/80 px-2 py-3 shadow-sm">
                    <span className="block text-2xl font-semibold tabular-nums sm:text-3xl">{String(part.value).padStart(2, "0")}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-foreground-muted sm:text-xs">{part.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-foreground-muted">
                Playback and downloads remain available until {new Date(share.expiresAt).toLocaleString()}.
              </p>
              <Button size="lg" onClick={() => setExpiryDialogOpen(false)} className="mt-6 w-full rounded-full">
                <CheckCircle2 className="size-5" aria-hidden />
                {isLive ? "Continue to live player" : share.kind === "series" ? "Browse episodes" : "Continue to player"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
