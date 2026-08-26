"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@appica/ui-react/button";

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
        "rounded-lg border border-error bg-error-subtle px-4 py-3 text-[15px] text-error-strong shadow-lg backdrop-blur-xl ring-1 ring-border",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 leading-snug">{message}</p>
        <div className="flex shrink-0 items-center gap-2">
          {onRetry ? (
            <Button
              type="button"
              onClick={onRetry}
            >
              {retryLabel}
            </Button>
          ) : null}
          {onDismiss ? (
            <Button variant="ghost"
              type="button"
              onClick={onDismiss}
              className="min-h-11 min-w-11 rounded-full text-foreground-intense outline-none transition-colors hover:bg-background-muted hover:text-foreground-intense focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Dismiss error"
            >
              x
            </Button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
