"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  busy: boolean;
  label?: string;
  className?: string;
  id?: string;
  children: React.ReactNode;
};

/** Keeps prior results visible while search/filter requests are in flight. */
export function LibraryResultsShell({
  busy,
  label = "Updating results…",
  className,
  id = "grid",
  children,
}: Props) {
  return (
    <div id={id} className={cn("relative scroll-mt-24", className)}>
      {busy ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center bg-black/35 pt-20 backdrop-blur-[2px] sm:pt-28"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/70 px-5 py-3 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
            <span className="text-[14px] font-medium text-white/90">{label}</span>
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "transition-opacity duration-200",
          busy && "pointer-events-none opacity-45",
        )}
      >
        {children}
      </div>
    </div>
  );
}
