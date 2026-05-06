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
    <div className="fixed bottom-6 left-1/2 z-[300] w-full max-w-lg -translate-x-1/2 px-4">
      <div className="flex items-start gap-3 rounded-2xl border border-red-400/25 bg-black/80 px-4 py-3.5 shadow-[0_8px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400/80" />
        <p className="flex-1 text-[14px] leading-snug text-white/80">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-white/40 outline-none hover:text-white/70 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
