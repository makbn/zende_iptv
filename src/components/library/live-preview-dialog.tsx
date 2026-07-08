"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import { StreamPlayer } from "@/components/player/stream-player";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { createWatchUrl } from "@/lib/navigation/watch-url";

type Props = {
  channel: M3uChannel | null;
  onClose: () => void;
};

export function LivePreviewDialog({ channel, onClose }: Props) {
  const router = useRouter();
  const [src, setSrc] = useState<string | null>(null);
  const [watchHref, setWatchHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (!channel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channel, onClose]);

  useEffect(() => {
    if (!channel || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [channel]);

  if (!channel || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/78 p-4 backdrop-blur-xl">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-[980px] overflow-hidden rounded-[28px] border border-white/15 bg-black shadow-[0_34px_120px_-44px_rgba(0,0,0,0.96)] ring-1 ring-white/[0.06]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white">
              Live Preview: {channel.name}
            </p>
            {channel.groupTitle ? (
              <p className="truncate text-[12px] text-white/45">{channel.groupTitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative aspect-video w-full bg-black">
          {src ? (
            <StreamPlayer src={src} controls className="h-full w-full" />
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[14px] text-amber-200/95">
              {error}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-white/60">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <span className="text-[14px]">Starting live preview…</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-[13px] font-semibold text-white/82 hover:bg-white/[0.1]"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!watchHref}
            onClick={() => {
              if (!watchHref) return;
              onClose();
              router.push(watchHref);
            }}
            className="rounded-full bg-[var(--zen-frost)] px-4 py-2 text-[13px] font-semibold text-[var(--zen-void)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Open full player
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
