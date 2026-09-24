"use client";

import { FullGuideBrowser } from "@/components/guide/full-guide-browser";
import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import {
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { useEnrichedFavoritesState } from "@/features/iptv/use-enriched-favorites";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { cn } from "@/lib/utils";
import { Radio } from "lucide-react";
import { useMemo } from "react";

export function GuidePageView({ mobile = false }: { mobile?: boolean }) {
  const { openChannel } = useWatchNavigation();
  const { channels: enrichedFavorites, loading: favoritesLoading } =
    useEnrichedFavoritesState({ serverOnly: true });

  const favoritesChannels = useMemo(
    () => enrichedFavorites.filter((channel) => resolveLibraryContentType(channel) === "live"),
    [enrichedFavorites],
  );

  const guideChannels = useMemo(() => favoritesChannels.slice(0, 60), [favoritesChannels]);

  const padClass = mobile ? "pb-28 pt-[5.35rem]" : cn("pb-28", TV_BROWSE_TOP_PAD_CLASS);

  return (
    <div className={cn("tv-guide-page bg-background min-h-screen text-foreground flex flex-col", padClass)}>
      <main className={cn(mobile ? "px-4" : undefined, "flex-1 flex flex-col")}>
        {!mobile ? (
          <section className={cn(BROWSE_CONTAINER_CLASS, "tv-browse-chrome pb-3 pt-4")}>
            <div className="tv-browse-chrome-inner flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Radio className="size-3.5 text-primary-strong" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                    Discover
                  </span>
                </div>
                <h1 className="tv-browse-chrome-title mt-1 text-[clamp(1.25rem,1.8vw,1.75rem)] font-semibold leading-none tracking-[-0.05em] text-foreground-intense">
                  TV guide
                </h1>
              </div>
              <div className="tv-browse-metrics grid grid-cols-2 gap-2 sm:w-[16rem]">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
                    Favorites
                  </p>
                  <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.04em] text-foreground-intense">
                    {favoritesChannels.length.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
                    Status
                  </p>
                  <p className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.04em] text-foreground-intense">
                    {favoritesLoading ? "Loading…" : "Ready"}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="mb-3 rounded-lg border border-border bg-background px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
              Discover
            </p>
            <h1 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.05em] text-foreground-intense">
              TV guide
            </h1>
          </section>
        )}

        <div
          className={
            mobile
              ? "space-y-5 flex-1 flex flex-col"
              : cn(BROWSE_CONTAINER_CLASS, "space-y-5 py-4 flex-1 flex flex-col min-h-0")
          }
        >
          <FullGuideBrowser
            seedChannels={guideChannels}
            seedReady={!favoritesLoading}
            mobile={mobile}
            onPlayChannel={openChannel}
          />
        </div>
      </main>

      {!mobile ? (
        <footer className="mt-auto shrink-0 border-t border-border py-5 text-center">
          <p className="text-[13px] text-foreground-intense">
            Guide data from your IPTV provider, with public XMLTV fallback when available.
          </p>
        </footer>
      ) : null}
    </div>
  );
}
