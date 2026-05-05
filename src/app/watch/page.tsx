import { Suspense } from "react";

import { WatchView } from "@/components/watch/watch-view";

export default function WatchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen animate-pulse bg-black" aria-hidden />
      }
    >
      <WatchView />
    </Suspense>
  );
}
