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
      <div
        ref={shellRef}
        className="relative min-h-screen overflow-x-hidden selection:bg-white/20"
      >
        {children}
      </div>
    </BrowseShellRefContext.Provider>
  );
}
