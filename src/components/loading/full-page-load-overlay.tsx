"use client";

import { useEffect, useState } from "react";

import { ZenedeLogoWave } from "@/components/loading/zenede-logo-wave";
import { cn } from "@/lib/utils";

/** Covers the viewport until `window` fires `load` (full document + resources). */
export function FullPageLoadOverlay() {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const done = () => setVisible(false);

    if (document.readyState === "complete") {
      done();
      return;
    }

    window.addEventListener("load", done);
    return () => window.removeEventListener("load", done);
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
