import { Suspense } from "react";

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
      <TvFavoritesPage />
    </Suspense>
  );
}
