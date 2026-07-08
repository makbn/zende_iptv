"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
  className?: string;
};

export function InlineErrorRegion({
  message,
  onDismiss,
  onRetry,
  retryLabel = "Retry",
  children,
  className,
}: Props) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "rounded-[24px] border border-red-400/25 bg-red-950/35 px-4 py-3 text-[15px] text-red-50 shadow-[0_18px_60px_-34px_rgba(0,0,0,0.9)] backdrop-blur-xl ring-1 ring-red-200/10",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 leading-snug">{message}</p>
        <div className="flex shrink-0 items-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-full bg-white/16 px-4 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
            >
              {retryLabel}
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-11 min-w-11 rounded-full text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
              aria-label="Dismiss error"
            >
              x
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
