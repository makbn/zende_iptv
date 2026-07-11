"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const WATCH_BROWSE_ORIGIN_KEY = "zende.watch.browseOrigin";

/** Safe return target from /watch (never another watch URL). Defaults to home. */
export function getWatchReturnHref(): string {
  if (typeof window === "undefined") return "/";
  try {
    const v = sessionStorage.getItem(WATCH_BROWSE_ORIGIN_KEY);
    if (v && !v.startsWith("/watch")) return v;
  } catch {
    /* ignore */
  }
  return "/";
}

/**
 * Records the last pathname outside `/watch` so the player Back control can return to
 * Library, Home, etc. instead of stepping through stacked watch URLs.
 */
export function WatchBrowseOriginTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname.startsWith("/watch")) {
      try {
        const qs = searchParams.toString();
        const href = qs ? `${pathname}?${qs}` : pathname;
        sessionStorage.setItem(WATCH_BROWSE_ORIGIN_KEY, href || "/");
      } catch {
        /* ignore quota / private mode */
      }
    }
  }, [pathname, searchParams]);

  return null;
}
