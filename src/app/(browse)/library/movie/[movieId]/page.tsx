import { Suspense } from "react";

import { MovieDetailView } from "@/components/library/movie-detail-view";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { BrowsePageFallback } from "@/components/states/browse-page-fallback";

type Props = {
  params: Promise<{ movieId: string }>;
  searchParams: Promise<{ title?: string; logo?: string; group?: string }>;
};

export default async function MoviePage({ params, searchParams }: Props) {
  const { movieId } = await params;
  const query = await searchParams;
  const view = (
    <MovieDetailView
      movieId={decodeURIComponent(movieId)}
      fallbackTitle={query.title}
      fallbackLogo={query.logo}
      fallbackGroup={query.group}
    />
  );

  return (
    <Suspense fallback={<BrowsePageFallback />}>
      <ResponsivePage mobile={view} desktop={view} />
    </Suspense>
  );
}
