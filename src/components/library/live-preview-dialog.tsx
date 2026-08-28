"use client";

import { useEffect, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import { StreamPlayer } from "@/components/player/stream-player";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@appica/ui-react/button";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { createWatchUrl } from "@/lib/navigation/watch-url";
import { zendeFetch } from "@/lib/auth/zende-fetch";

type Props = {
  channel: M3uChannel | null;
  onClose: () => void;
  presentation?: "dialog" | "embedded";
};

type EpgSlot = {
  title: string;
  startMs: number;
  stopMs: number;
};

type ChannelEpg = {
  current: EpgSlot | null;
  next: EpgSlot | null;
};

function formatClock(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatSlotTime(slot: EpgSlot): string {
  return `${formatClock(slot.startMs)}–${formatClock(slot.stopMs)}`;
}

export function LivePreviewDialog({ channel, onClose, presentation = "dialog" }: Props) {
  const router = useRouter();
  const [src, setSrc] = useState<string | null>(null);
  const [watchHref, setWatchHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [epg, setEpg] = useState<ChannelEpg | null>(null);
  const [epgLoading, setEpgLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSrc(null);
      setError(null);
    });
    void (async () => {
      try {
        const href = await createWatchUrl({
          url: channel.url,
          name: channel.name,
          ...(channel.tvgLogo ? { tvgLogo: channel.tvgLogo } : {}),
          ...(channel.groupTitle ? { groupTitle: channel.groupTitle } : {}),
          ...(channel.providerId ? { providerId: channel.providerId } : {}),
          ...(channel.tvgId ? { tvgId: channel.tvgId } : {}),
          playback: { contentKind: "live" },
        });
        if (!cancelled) setWatchHref(href);
        const id = new URL(href, window.location.origin).searchParams.get("id");
        if (!id) throw new Error("Could not create preview session.");
        const playbackUrl = `/api/stream/proxy/${encodeURIComponent(id)}`;
        if (!cancelled) setSrc(playbackUrl);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Preview unavailable.");
          setWatchHref(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel]);

  useEffect(() => {
    const tvgId = channel?.tvgId?.trim();
    const controller = new AbortController();
    queueMicrotask(() => {
      setEpg(null);
      setEpgLoading(Boolean(tvgId));
    });
    if (!tvgId) return () => controller.abort();

    void (async () => {
      try {
        const response = await zendeFetch("/api/epg/programs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [tvgId] }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          programs?: Record<string, ChannelEpg>;
        };
        if (!controller.signal.aborted) {
          setEpg(payload.programs?.[tvgId] ?? null);
        }
      } catch {
        // Preview remains usable when guide lookup fails.
      } finally {
        if (!controller.signal.aborted) setEpgLoading(false);
      }
    })();
    return () => controller.abort();
  }, [channel]);

  useEffect(() => {
    if (!channel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channel, onClose]);

  useEffect(() => {
    if (!channel || presentation === "embedded" || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [channel, presentation]);

  if (!channel || !mounted) return null;

  if (presentation === "embedded") {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="relative aspect-video w-full bg-background">
          {src ? (
            <StreamPlayer
              src={src}
              controls
              className="h-full w-full"
              onError={(playerError) => {
                if (!playerError.fatal) return;
                setSrc(null);
                setError("This provider rejected the live preview. The full EPG remains available.");
              }}
            />
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-warning-strong">
              {error}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-foreground-intense">
              <ZendeSpinner size="small" label="Loading live preview" />
              <span className="text-[13px]">Loading live preview independently…</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-foreground-intense">{channel.name}</p>
            <p className="mt-0.5 text-[10px] text-foreground-intense">
              {error ? "Preview unavailable — guide unaffected" : "Shared Library preview player"}
            </p>
          </div>
          <Button
            type="button"
            disabled={!watchHref}
            onClick={() => {
              if (watchHref) router.push(watchHref);
            }}
            size="sm"
            className="shrink-0"
          >
            Full player
          </Button>
        </div>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-background p-4 backdrop-blur-xl">
      <Button variant="ghost"
        type="button"
        className="absolute inset-0"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-[980px] overflow-y-auto rounded-lg border border-border bg-background shadow-lg ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold tracking-[-0.02em] text-foreground-intense">
              Live Preview: {channel.name}
            </p>
            {channel.groupTitle ? (
              <p className="truncate text-[12px] text-foreground-intense">{channel.groupTitle}</p>
            ) : null}
          </div>
          <Button variant="ghost"
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-foreground-intense hover:bg-background-muted hover:text-foreground-intense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative aspect-video w-full bg-background">
          {src ? (
            <StreamPlayer
              src={src}
              controls
              className="h-full w-full"
              onError={(playerError) => {
                if (!playerError.fatal) return;
                setSrc(null);
                setError("This provider rejected the live preview. You can still inspect its programme guide.");
              }}
            />
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[14px] text-warning-strong">
              {error}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-foreground-intense">
              <ZendeSpinner size="small" label="Loading programme guide" />
              <span className="text-[14px]">Starting live preview…</span>
            </div>
          )}
        </div>
        <div className="border-t border-border bg-background-muted px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
            <CalendarClock className="size-3.5 text-primary-strong/80" aria-hidden />
            Programme guide
          </div>
          {epgLoading ? (
            <div className="grid grid-cols-2 gap-2" aria-label="Loading programme guide">
              <div className="h-[54px] animate-pulse rounded-xl bg-background-muted" />
              <div className="h-[54px] animate-pulse rounded-xl bg-background-muted" />
            </div>
          ) : epg?.current || epg?.next ? (
            <div className="grid grid-cols-2 gap-2">
              {(["current", "next"] as const).map((kind) => {
                const slot = epg?.[kind] ?? null;
                return (
                  <div
                    key={kind}
                    className="min-w-0 rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-foreground-intense">
                      {kind === "current" ? "Now" : "Next"}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] font-semibold text-foreground-intense">
                      {slot?.title ?? "—"}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-foreground-intense">
                      {slot ? formatSlotTime(slot) : "No listing"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-background px-3 py-2 text-[12px] text-foreground-intense">
              {channel.tvgId?.trim() ? "No current programme data." : "This channel has no EPG ID."}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            onClick={onClose}
            size="sm"
          >
            Close
          </Button>
          <Button
            type="button"
            disabled={!watchHref}
            onClick={() => {
              if (!watchHref) return;
              onClose();
              router.push(watchHref);
            }}
            variant="primary"
            size="sm"
          >
            Open full player
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
