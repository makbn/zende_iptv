import { Suspense } from "react";

import { BrowsePageFallback } from "@/components/states/browse-page-fallback";
import { MobileLibraryPage } from "@/components/mobile/mobile-library-page";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { TvLibraryPage } from "@/components/tv/tv-library-page";

export default function Library() {
  return (
    <Suspense fallback={<BrowsePageFallback />}>
      <ResponsivePage
        mobile={<MobileLibraryPage />}
        desktop={<TvLibraryPage />}
      />
    </Suspense>
  );
}
