import { Suspense } from "react";

import { BrowsePageFallback } from "@/components/states/browse-page-fallback";
import { MobileFavoritesPage } from "@/components/mobile/mobile-favorites-page";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { TvFavoritesPage } from "@/components/tv/tv-favorites-page";

export default function Favorites() {
  return (
    <Suspense fallback={<BrowsePageFallback />}>
      <ResponsivePage
        mobile={<MobileFavoritesPage />}
        desktop={<TvFavoritesPage />}
      />
    </Suspense>
  );
}
