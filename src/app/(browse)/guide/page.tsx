import { Suspense } from "react";

import { GuidePageView } from "@/components/guide/guide-page-view";
import { BrowsePageFallback } from "@/components/states/browse-page-fallback";
import { ResponsivePage } from "@/components/mobile/responsive-page";

export default function GuidePage() {
  return (
    <Suspense fallback={<BrowsePageFallback />}>
      <ResponsivePage
        mobile={<GuidePageView mobile />}
        desktop={<GuidePageView />}
      />
    </Suspense>
  );
}
