import { Suspense } from "react";

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
      <TvRecordingsPage />
    </Suspense>
  );
}
