"use client";

import {
  createContext,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

export const BrowseShellRefContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

export function BrowseChrome({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null);
  return (
    <BrowseShellRefContext.Provider value={shellRef}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[500] focus:rounded-full focus:bg-[var(--zen-frost)] focus:px-4 focus:py-2 focus:text-[15px] focus:font-semibold focus:text-[var(--zen-void)] focus:shadow-[0_18px_42px_-20px_rgba(56,217,255,0.55)]"
      >
        Skip to main content
      </a>
      <div
        ref={shellRef}
        className="zen-page-bg relative min-h-screen overflow-x-hidden selection:bg-[var(--zen-signal)]/25"
      >
        <div className="zen-signal-beams fixed" aria-hidden />
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-32 bg-gradient-to-b from-black/50 to-transparent"
          aria-hidden
        />
        <div className="motion-safe:animate-zen-browse-mount motion-reduce:animate-none motion-reduce:opacity-100 min-h-screen">
          {children}
        </div>
      </div>
    </BrowseShellRefContext.Provider>
  );
}
