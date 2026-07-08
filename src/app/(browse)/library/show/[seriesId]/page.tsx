import { Suspense } from "react";

import { SeriesDetailView } from "@/components/library/series-detail-view";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { BrowsePageFallback } from "@/components/states/browse-page-fallback";

type Props = {
  params: Promise<{ seriesId: string }>;
  searchParams: Promise<{ title?: string; logo?: string; group?: string }>;
};

export default async function ShowPage({ params, searchParams }: Props) {
  const { seriesId } = await params;
  const q = await searchParams;

  return (
    <Suspense fallback={<BrowsePageFallback />}>
      <ResponsivePage
        mobile={
          <SeriesDetailView
            seriesId={decodeURIComponent(seriesId)}
            fallbackTitle={q.title}
            fallbackLogo={q.logo}
            fallbackGroup={q.group}
          />
        }
        desktop={
          <SeriesDetailView
            seriesId={decodeURIComponent(seriesId)}
            fallbackTitle={q.title}
            fallbackLogo={q.logo}
            fallbackGroup={q.group}
          />
        }
      />
    </Suspense>
  );
}
