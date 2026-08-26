"use client";

import { Button } from "@appica/ui-react/button";

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
      <div className="flex items-start gap-3 rounded-lg border border-error bg-background px-4 py-3.5 shadow-lg backdrop-blur-2xl ring-1 ring-border">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error-strong" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-error-strong">
            Playback could not start
          </p>
          <p className="mt-1 text-[14px] leading-snug text-foreground-intense">{message}</p>
        </div>
        <Button variant="ghost"
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 text-foreground-intense outline-none transition-colors hover:bg-background-muted hover:text-foreground-intense focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
