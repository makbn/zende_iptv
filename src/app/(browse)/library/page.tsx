import { Suspense } from "react";

import { TvLibraryPage } from "@/components/tv/tv-library-page";

export default function Library() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-[var(--tv-page-bg)] pt-20"
          aria-hidden
        />
      }
    >
      <TvLibraryPage />
    </Suspense>
  );
}
