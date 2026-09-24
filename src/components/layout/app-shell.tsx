"use client";

import {
  createContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

import { isTvEnvironment } from "@/lib/tv/tv-environment";

export const BrowseShellRefContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

function subscribeToBrowserEnvironment(): () => void {
  return () => {};
}

export function AppShell({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const tv = useSyncExternalStore(
    subscribeToBrowserEnvironment,
    () => isTvEnvironment(),
    () => false,
  );
  return (
    <BrowseShellRefContext.Provider value={shellRef}>
      {!tv ? (
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[500] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to main content
        </a>
      ) : null}
      <div
        ref={shellRef}
        className="tv-app-shell relative min-h-screen overflow-x-hidden bg-background-subtle selection:bg-primary-soft"
      >
        <div className="min-h-screen">
          {children}
        </div>
      </div>
    </BrowseShellRefContext.Provider>
  );
}
