"use client";

import { cn } from "@/lib/utils";

/** Small pill on channel art (top-right), e.g. 1080p */
export function ChannelResolutionBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none select-none rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums tracking-wide text-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.45)] ring-1 ring-white/22 backdrop-blur-md sm:text-[10px]",
        className,
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}
