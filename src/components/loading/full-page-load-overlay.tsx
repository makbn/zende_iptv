"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { ZendeSpinner } from "@/components/loading/zende-spinner";
import {
  PLAYBACK_NAVIGATION_END_EVENT,
  PLAYBACK_NAVIGATION_START_EVENT,
  type PlaybackNavigationEndDetail,
  type PlaybackNavigationStartDetail,
} from "@/lib/navigation/playback-navigation-feedback";
import { cn } from "@/lib/utils";

/**
 * Hides once the HTML document is parsed (`DOMContentLoaded`), not `window` `load`.
 * Waiting for `load` in dev waits on every pending script chunk — the overlay can sit
 * for minutes behind a slow/competing chunk request; incognito often “fixes” it by cache.
 */
export function FullPageLoadOverlay() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [playback, setPlayback] = useState<PlaybackNavigationStartDetail | null>(
    null,
  );
  const activeTokenRef = useRef<string | null>(null);
  const previousPathnameRef = useRef(pathname);
  const failSafeRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled && !activeTokenRef.current) setVisible(false);
        });
      });
    };

    if (document.readyState !== "loading") {
      reveal();
    } else {
      document.addEventListener("DOMContentLoaded", reveal, { once: true });
    }

    const failSafe = window.setTimeout(reveal, 2500);

    return () => {
      cancelled = true;
      clearTimeout(failSafe);
    };
  }, []);

  useEffect(() => {
    const clearFailSafe = () => {
      if (failSafeRef.current !== null) {
        window.clearTimeout(failSafeRef.current);
        failSafeRef.current = null;
      }
    };

    const hidePlayback = (token: string) => {
      if (activeTokenRef.current !== token) return;
      clearFailSafe();
      activeTokenRef.current = null;
      setVisible(false);
    };

    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackNavigationStartDetail>)
        .detail;
      clearFailSafe();
      activeTokenRef.current = detail.token;
      setPlayback(detail);
      setMounted(true);
      setVisible(true);

      // Never leave the application trapped behind the feedback layer if a
      // navigation is interrupted by the browser or an unexpected exception.
      failSafeRef.current = window.setTimeout(
        () => hidePlayback(detail.token),
        30_000,
      );
    };

    const handleEnd = (event: Event) => {
      const { token } = (
        event as CustomEvent<PlaybackNavigationEndDetail>
      ).detail;
      hidePlayback(token);
    };

    window.addEventListener(PLAYBACK_NAVIGATION_START_EVENT, handleStart);
    window.addEventListener(PLAYBACK_NAVIGATION_END_EVENT, handleEnd);
    return () => {
      clearFailSafe();
      window.removeEventListener(PLAYBACK_NAVIGATION_START_EVENT, handleStart);
      window.removeEventListener(PLAYBACK_NAVIGATION_END_EVENT, handleEnd);
    };
  }, []);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;

    const token = activeTokenRef.current;
    if (!token) return;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (activeTokenRef.current === token) {
          activeTokenRef.current = null;
          setVisible(false);
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [pathname]);

  useEffect(() => {
    if (visible) return;
    const t = window.setTimeout(() => setMounted(false), 650);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[300] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ease-out motion-reduce:duration-150",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onTransitionEnd={(e) => {
        if (e.propertyName === "opacity" && !visible) {
          setMounted(false);
        }
      }}
      aria-live="polite"
      aria-busy={visible}
    >
      <span className="sr-only">
        {playback ? `${playback.message} ${playback.title}` : "Loading"}
      </span>
      <ZendeSpinner
        size="full"
        label={playback ? `${playback.message} ${playback.title}` : "Loading Zende"}
      />
      {playback ? (
        <div className="mt-7 max-w-[min(88vw,32rem)] text-center">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-primary-strong">
            Request received
          </p>
          <p className="mt-2 truncate text-lg font-semibold text-foreground-intense sm:text-xl">
            {playback.title}
          </p>
          <p className="mt-1 text-sm text-foreground-intense">{playback.message}</p>
        </div>
      ) : null}
    </div>
  );
}
