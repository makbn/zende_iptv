import dynamic from "next/dynamic";
import { Suspense } from "react";

import { BrowsePageFallback } from "@/components/states/browse-page-fallback";
import { ResponsivePage } from "@/components/mobile/responsive-page";

const MobileRecordingsPage = dynamic(
  () =>
    import("@/components/mobile/mobile-recordings-page").then(
      (m) => m.MobileRecordingsPage,
    ),
  { loading: () => <BrowsePageFallback /> },
);

const TvRecordingsPage = dynamic(
  () =>
    import("@/components/tv/tv-recordings-page").then((m) => m.TvRecordingsPage),
  { loading: () => <BrowsePageFallback /> },
);

export default function RecordingsPage() {
  return (
    <Suspense fallback={<BrowsePageFallback />}>
      <ResponsivePage
        mobile={<MobileRecordingsPage />}
        desktop={<TvRecordingsPage />}
      />
    </Suspense>
  );
}
