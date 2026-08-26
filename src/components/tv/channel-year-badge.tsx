"use client";

import { cn } from "@/lib/utils";

/** Small pill on VOD art (top-right), e.g. 2021 */
export function ChannelYearBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none select-none rounded-md bg-background px-1.5 py-0.5 text-[9px] font-semibold tabular-nums tracking-wide text-primary-strong shadow-lg ring-1 ring-border backdrop-blur-md sm:text-[10px]",
        className,
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}
