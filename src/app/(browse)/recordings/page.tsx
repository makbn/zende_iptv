import { Suspense } from "react";

import { MobileRecordingsPage } from "@/components/mobile/mobile-recordings-page";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { TvRecordingsPage } from "@/components/tv/tv-recordings-page";

export default function RecordingsPage() {
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
        mobile={<MobileRecordingsPage />}
        desktop={<TvRecordingsPage />}
      />
    </Suspense>
  );
}
