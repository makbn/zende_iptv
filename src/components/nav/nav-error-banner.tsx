"use client";

import { AlertCircle, X } from "lucide-react";

export function NavErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed bottom-6 left-1/2 z-[300] w-full max-w-lg -translate-x-1/2 px-4 max-md:bottom-28"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 rounded-[24px] border border-red-400/25 bg-black/82 px-4 py-3.5 shadow-[0_18px_64px_-26px_rgba(0,0,0,0.92)] backdrop-blur-2xl ring-1 ring-red-200/10">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300/90" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-red-200/65">
            Playback could not start
          </p>
          <p className="mt-1 text-[14px] leading-snug text-white/82">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 text-white/45 outline-none transition-colors hover:bg-white/10 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
