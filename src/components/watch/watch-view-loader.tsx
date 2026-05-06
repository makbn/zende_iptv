"use client";

import dynamic from "next/dynamic";

const shell = (
  <div className="min-h-screen animate-pulse bg-black" aria-hidden />
);

/**
 * Lazy boundary so `/watch` initial JS stays small: webpack compiles HLS + UI after navigation.
 */
const WatchView = dynamic(
  () =>
    import("@/components/watch/watch-view").then((m) => ({
      default: m.WatchView,
    })),
  { ssr: false, loading: () => shell },
);

export function WatchViewLoader() {
  return <WatchView />;
}
