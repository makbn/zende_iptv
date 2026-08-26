import { Suspense } from "react";

import { WatchViewLoader } from "@/components/watch/watch-view-loader";

const shell = (
  <div className="min-h-screen animate-pulse bg-background" aria-hidden />
);

export default function WatchPage() {
  return (
    <Suspense fallback={shell}>
      <WatchViewLoader />
    </Suspense>
  );
}
