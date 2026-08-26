"use client";

import { cn } from "@/lib/utils";

export function TvContinueEmpty() {
  return (
    <div
      className={cn(
        "flex w-[min(100vw-3rem,420px)] shrink-0 snap-start flex-col justify-center rounded-2xl",
        "border border-dashed border-border bg-background-muted px-8 py-12 ring-1 ring-border",
      )}
      role="status"
    >
      <p className="text-[17px] font-semibold tracking-tight text-foreground-intense">
        Nothing in Continue Watching
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-foreground-intense">
        When you start playback, your place is saved here — tuned for slow
        networks and quick resume.
      </p>
    </div>
  );
}
