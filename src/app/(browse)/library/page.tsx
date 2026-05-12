import { Suspense } from "react";

import { MobileLibraryPage } from "@/components/mobile/mobile-library-page";
import { ResponsivePage } from "@/components/mobile/responsive-page";
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
      <ResponsivePage
        mobile={<MobileLibraryPage />}
        desktop={<TvLibraryPage />}
      />
    </Suspense>
  );
}
