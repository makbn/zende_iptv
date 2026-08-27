import { Suspense } from "react";

import { MobileSettingsPage } from "@/components/mobile/mobile-settings-page";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { BrowsePageFallback } from "@/components/states/browse-page-fallback";
import { TvSettingsPage } from "@/components/tv/tv-settings-page";

export default function Settings() {
  return (
    <Suspense fallback={<BrowsePageFallback />}>
      <ResponsivePage mobile={<MobileSettingsPage />} desktop={<TvSettingsPage />} />
    </Suspense>
  );
}
