"use client";

import { useEffect, useState } from "react";

import { ZenedeLogoWave } from "@/components/loading/zenede-logo-wave";
import { cn } from "@/lib/utils";

/**
 * Hides once the HTML document is parsed (`DOMContentLoaded`), not `window` `load`.
 * Waiting for `load` in dev waits on every pending script chunk — the overlay can sit
 * for minutes behind a slow/competing chunk request; incognito often “fixes” it by cache.
 */
export function FullPageLoadOverlay() {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setVisible(false);
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
    if (visible) return;
    const t = window.setTimeout(() => setMounted(false), 650);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[var(--tv-page-bg)] transition-opacity duration-500 ease-out motion-reduce:duration-150",
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
      <span className="sr-only">Loading</span>
      <ZenedeLogoWave size="lg" />
    </div>
  );
}
