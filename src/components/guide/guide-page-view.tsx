"use client";

import { FullGuideBrowser } from "@/components/guide/full-guide-browser";
import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import {
  AppicaPanel,
  AppicaHero,
  AppicaMetrics,
} from "@/components/layout/appica-page";
import {
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useEnrichedFavorites } from "@/features/iptv/use-enriched-favorites";
import { useLibraryCatalog } from "@/features/iptv/use-library-catalog";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

export function GuidePageView({ mobile = false }: { mobile?: boolean }) {
  const { openChannel } = useWatchNavigation();
  const enrichedFavorites = useEnrichedFavorites({ serverOnly: true });

  const favoritesChannels = useMemo(
    () => enrichedFavorites.filter((channel) => resolveLibraryContentType(channel) === "live"),
    [enrichedFavorites],
  );

  const liveCatalog = useLibraryCatalog({
    presetId: source.presetId,
    contentTab: "live",
    query: "",
    groupFilter: null,
    languageFilter: null,
    offset: 0,
    pageSize: 48,
  });

  const favUrls = useMemo(
    () => new Set(favoritesChannels.map((c) => c.url)),
    [favoritesChannels],
  );

  const discoverLive = useMemo(
    () => liveCatalog.channels.filter((c) => !favUrls.has(c.url)).slice(0, 24),
    [liveCatalog.channels, favUrls],
  );

  const shelf = useMemo(
    () => [...favoritesChannels, ...discoverLive],
    [favoritesChannels, discoverLive],
  );

  const guideChannels = useMemo(() => shelf.slice(0, 48), [shelf]);

  const padClass = mobile ? "pb-28 pt-[5.35rem]" : cn("pb-28", TV_BROWSE_TOP_PAD_CLASS);

  return (
    <div className={cn("bg-background min-h-screen text-foreground", padClass)}>
      <main className={mobile ? "px-4" : undefined}>
        {!mobile ? (
          <AppicaHero
            className="pb-8 pt-8"
            eyebrow="Guide"
            title="TV guide"
            description="Search every live channel and programme, preview it, and inspect the complete provider schedule."
            aside={
              <AppicaPanel>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Guide status</p>
                <AppicaMetrics
                  className="mt-4"
                  metrics={[
                    {
                      label: "Favorites",
                      value: favoritesChannels.length.toLocaleString(),
                      tone: "ember",
                    },
                    {
                      label: "Discover",
                      value: discoverLive.length.toLocaleString(),
                      tone: "signal",
                    },
                    {
                      label: "Mode",
                      value: liveCatalog.loading ? "Syncing" : "Live",
                    },
                  ]}
                />
                <p className="mt-5 text-[14px] leading-relaxed text-foreground-intense">
                  Provider schedules load automatically for channels that include an EPG ID.
                </p>
              </AppicaPanel>
            }
          />
        ) : (
          <section className="border border-border bg-background-subtle shadow-sm mb-4 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted text-[10px]">
              Guide
            </p>
            <h1 className="mt-1 text-[1.45rem] font-semibold tracking-[-0.055em] text-foreground-intense">TV guide</h1>
            <p className="mt-2 text-[12px] text-foreground-intense">
              Search channels and programmes, then select one for its full schedule and live preview.
            </p>
          </section>
        )}

        <div
          className={
            mobile
              ? "space-y-6"
              : cn(BROWSE_CONTAINER_CLASS, "space-y-10")
          }
        >
          <FullGuideBrowser
            seedChannels={guideChannels}
            mobile={mobile}
            onPlayChannel={openChannel}
          />
        </div>
      </main>

      {!mobile ? (
        <footer className="mt-10 border-t border-border py-10 text-center">
          <p className="text-[13px] text-foreground-intense">
            Guide data from your IPTV provider, with public XMLTV fallback when available.
          </p>
        </footer>
      ) : null}
    </div>
  );
}
