"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title?: string;
  /** Saved playback position in seconds. */
  positionSeconds: number;
  /** Auto-continue countdown; omit to disable. */
  timeLeft?: number | null;
  tvMode?: boolean;
  formatClock: (seconds: number) => string;
  onContinue: () => void;
  onStartOver: () => void;
};

/**
 * Continue vs start-over prompt for VOD. TV layout uses large focusable
 * actions and puts Continue as the initial focus target.
 */
export function ResumePlaybackDialog({
  open,
  title,
  positionSeconds,
  timeLeft,
  tvMode = false,
  formatClock,
  onContinue,
  onStartOver,
}: Props) {
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      continueRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, positionSeconds]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm",
        tvMode && "p-8",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Resume playback"
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.keyCode === 10009) {
          event.preventDefault();
          event.stopPropagation();
          onStartOver();
        }
      }}
    >
      <div
        className={cn(
          "w-full max-w-md rounded-2xl border border-white/10 bg-[#0c1220] px-6 py-6 text-center shadow-2xl",
          tvMode && "max-w-2xl rounded-3xl px-10 py-10",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45",
            tvMode && "text-sm",
          )}
        >
          Resume playback
        </p>
        {title ? (
          <h2
            className={cn(
              "mt-2 truncate text-[18px] font-semibold tracking-tight text-white",
              tvMode && "mt-3 text-3xl",
            )}
          >
            {title}
          </h2>
        ) : (
          <h2
            className={cn(
              "mt-2 text-[18px] font-semibold tracking-tight text-white",
              tvMode && "mt-3 text-3xl",
            )}
          >
            Continue watching?
          </h2>
        )}
        <p
          className={cn(
            "mt-3 text-[14px] text-white/60",
            tvMode && "mt-4 text-xl text-white/70",
          )}
        >
          You left off at {formatClock(positionSeconds)}. Continue or start over?
        </p>
        <div
          data-tv-layout={tvMode ? "horizontal" : undefined}
          className={cn(
            "mt-6 flex flex-col gap-3 sm:flex-row",
            tvMode && "mt-10 gap-5",
          )}
        >
          <button
            type="button"
            onClick={onStartOver}
            className={cn(
              "min-h-12 flex-1 rounded-xl bg-white/10 px-4 text-[15px] font-semibold text-white outline-none transition-colors",
              "hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40",
              tvMode && "min-h-16 rounded-2xl text-2xl",
            )}
          >
            Start over
          </button>
          <button
            ref={continueRef}
            type="button"
            data-tv-initial-focus=""
            onClick={onContinue}
            className={cn(
              "min-h-12 flex-1 rounded-xl bg-[#ff3f91] px-4 text-[15px] font-semibold text-white outline-none transition-colors",
              "hover:bg-[#ff5aa0] focus-visible:ring-2 focus-visible:ring-white/50",
              tvMode && "min-h-16 rounded-2xl text-2xl",
            )}
          >
            {timeLeft != null ? `Continue (${timeLeft}s)` : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
