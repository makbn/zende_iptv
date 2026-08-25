"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";

import { ZendeLoadingState } from "@/components/loading/zende-spinner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import {
  fetchWatchSessionMeta,
  type WatchSessionMeta,
} from "@/lib/navigation/watch-url";

const StreamPlayer = dynamic(
  () =>
    import("@/components/player/stream-player").then((m) => m.StreamPlayer),
  { ssr: false },
);

// ── grid layout helpers ────────────────────────────────────────────────────────

function gridClass(n: number) {
  if (n === 1) return "grid-cols-1";
  if (n === 2) return "grid-cols-1 sm:grid-cols-2";
  if (n <= 4) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

function cellClass(n: number, idx: number) {
  // For 3 streams: lone third cell is centred at half-width
  if (n === 3 && idx === 2) {
    return "sm:col-span-2 sm:w-1/2 sm:justify-self-center";
  }
  return "";
}

// ── types ──────────────────────────────────────────────────────────────────────

type Session = WatchSessionMeta & { id: string };

// ── component ──────────────────────────────────────────────────────────────────

export function BoardView() {
  const searchParams = useSearchParams();
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(ids.length > 0);

  // Which session currently has audio; null = all muted.
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const audioMenuRef = useRef<HTMLDivElement>(null);

  // Map of session id → <video> element, updated via ref callbacks.
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // ── fetch sessions ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (ids.length === 0) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    queueMicrotask(() => setLoading(true));
    Promise.all(
      ids.map(async (id) => ({ ...(await fetchWatchSessionMeta(id)), id })),
    )
      .then((results) => { setSessions(results); setLoading(false); })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Could not load sessions.");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  // ── apply muted state whenever the active audio stream changes ─────────────

  useEffect(() => {
    for (const [id, video] of videoRefs.current) {
      video.muted = id !== activeAudioId;
    }
  }, [activeAudioId]);

  // ── close audio menu on outside click ─────────────────────────────────────

  useEffect(() => {
    if (!audioMenuOpen) return;
    const fn = (e: PointerEvent) => {
      if (!audioMenuRef.current?.contains(e.target as Node)) setAudioMenuOpen(false);
    };
    document.addEventListener("pointerdown", fn);
    return () => document.removeEventListener("pointerdown", fn);
  }, [audioMenuOpen]);

  // ── ref callback factory ───────────────────────────────────────────────────

  function makeVideoRef(id: string) {
    return (el: HTMLVideoElement | null) => {
      if (el) {
        videoRefs.current.set(id, el);
        // Apply current muted state immediately on mount
        el.muted = id !== activeAudioId;
      } else {
        videoRefs.current.delete(id);
      }
    };
  }

  // ── loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black text-white">
        <ZendeLoadingState
          size="large"
          label={`Preparing ${ids.length} stream${ids.length !== 1 ? "s" : ""}…`}
        />
      </div>
    );
  }

  if (loadError || sessions.length === 0) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black text-white">
        <p className="text-[16px] text-white/60">
          {loadError ?? "No channels selected."}
        </p>
        <Link
          href="/"
          className={buttonVariants({ variant: "normal", size: "lg" })}
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const n = sessions.length;
  const activeSession = sessions.find((s) => s.id === activeAudioId);

  // ── board ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">

      {/* ── header ── */}
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.1] bg-black/72 px-3 py-2 shadow-[0_18px_60px_-34px_rgba(0,0,0,0.92)] backdrop-blur-xl sm:h-12 sm:px-4 sm:py-0">
        {/* Left: back + title */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-white/55 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <span className="hidden text-white/[0.15] sm:inline">|</span>
          <p className="hidden text-[13px] font-medium text-white/60 sm:block">
            Board -{" "}
            <span className="text-white/90">
              {n} channel{n !== 1 ? "s" : ""}
            </span>
          </p>
        </div>

        {/* Right: audio source picker */}
        <div className="relative" ref={audioMenuRef}>
          <button
            type="button"
            onClick={() => setAudioMenuOpen((v) => !v)}
            aria-label="Select audio source"
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold outline-none transition-colors",
              "border border-white/[0.12] bg-white/[0.07] hover:bg-white/[0.11] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
              audioMenuOpen && "bg-white/[0.12]",
            )}
          >
            {activeAudioId ? (
              <Volume2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <VolumeX className="h-4 w-4 text-white/40" />
            )}
            <span className="max-w-[118px] truncate text-white/80 sm:max-w-[160px]">
              {activeSession ? activeSession.title : "All muted"}
            </span>
          </button>

          {/* Dropdown */}
          {audioMenuOpen && (
            <div
              className={cn(
                "absolute right-0 top-[calc(100%+8px)] z-50 min-w-[min(82vw,260px)] overflow-hidden rounded-[22px] p-1",
                "border border-white/[0.14] bg-black/90 shadow-2xl backdrop-blur-2xl",
              )}
            >
              {/* Mute all option */}
              <button
                type="button"
                onClick={() => { setActiveAudioId(null); setAudioMenuOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] outline-none transition-colors",
                  "hover:bg-white/[0.08]",
                  activeAudioId === null ? "text-white" : "text-white/55",
                )}
              >
                <VolumeX className="h-4 w-4 shrink-0" />
                <span>All muted</span>
                {activeAudioId === null && (
                  <span className="ml-auto text-emerald-400">✓</span>
                )}
              </button>

              <div className="my-1 border-t border-white/[0.08]" />

              {/* One option per stream */}
              {sessions.map((session) => {
                const active = activeAudioId === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => { setActiveAudioId(session.id); setAudioMenuOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] outline-none transition-colors",
                      "hover:bg-white/[0.08]",
                      active ? "text-white" : "text-white/55",
                    )}
                  >
                    <Volume2
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-emerald-400" : "text-white/30",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    {active && <span className="ml-auto text-emerald-400">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── stream grid ── */}
      <div className={cn("grid flex-1 gap-px bg-white/[0.05]", gridClass(n))}>
        {sessions.map((session, idx) => (
          <div
            key={session.id}
            className={cn(
              "group relative overflow-hidden bg-black",
              cellClass(n, idx),
            )}
          >
            <StreamPlayer
              ref={makeVideoRef(session.id)}
              src={session.playbackUrl}
              controls={false}
              className="absolute inset-0 h-full w-full"
            />

            {/* Hover overlay: channel name + audio indicator */}
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2",
                "bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3",
                "opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100",
              )}
            >
              {session.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={secureImageUrl(session.logo, undefined, "logo")}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded object-contain"
                />
              ) : null}
              <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/90">
                {session.title}
              </p>
              {activeAudioId === session.id && (
                <Volume2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
