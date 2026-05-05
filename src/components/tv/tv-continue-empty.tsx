"use client";

import { cn } from "@/lib/utils";

export function TvContinueEmpty() {
  return (
    <div
      className={cn(
        "flex w-[min(100vw-3rem,420px)] shrink-0 snap-start flex-col justify-center rounded-2xl",
        "border border-dashed border-white/[0.12] bg-white/[0.03] px-8 py-12 ring-1 ring-white/[0.04]",
      )}
      role="status"
    >
      <p className="text-[17px] font-semibold tracking-tight text-white">
        Nothing in Continue Watching
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-white/48">
        When you start playback, your place is saved here — tuned for slow
        networks and quick resume.
      </p>
    </div>
  );
}
