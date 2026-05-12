import { Suspense } from "react";

import { MobileFavoritesPage } from "@/components/mobile/mobile-favorites-page";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { TvFavoritesPage } from "@/components/tv/tv-favorites-page";

export default function Favorites() {
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
        mobile={<MobileFavoritesPage />}
        desktop={<TvFavoritesPage />}
      />
    </Suspense>
  );
}
