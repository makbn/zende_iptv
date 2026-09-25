"use client";

import { FullGuideBrowser } from "@/components/guide/full-guide-browser";
import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import { StreamPageHero, StreamPageShell } from "@/components/tv/stream-page-shell";
import {
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { useEnrichedFavoritesState } from "@/features/iptv/use-enriched-favorites";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { cn } from "@/lib/utils";
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
  const heroArt = favoritesChannels.find((ch) => ch.tvgLogo)?.tvgLogo;

  const padClass = mobile ? "pb-28 pt-[5.35rem]" : cn("pb-28", TV_BROWSE_TOP_PAD_CLASS);

  return (
    <StreamPageShell pageClassName={cn("tv-guide-page flex flex-col", padClass)}>
      <main className={cn(mobile ? "px-4" : undefined, "flex flex-1 flex-col")}>
        {!mobile ? (
          <StreamPageHero
            eyebrow="Discover"
            title="What's on"
            subtitle={
              favoritesLoading
                ? "Loading your favorite channels…"
                : favoritesChannels.length > 0
                  ? `Live guide across ${favoritesChannels.length.toLocaleString()} favorites`
                  : "Star live channels in Favorites to populate your personal guide."
            }
            artUrl={heroArt ? secureImageUrl(heroArt, undefined, "poster") : null}
          />
        ) : (
          <section className="mb-4 px-1 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Discover
            </p>
            <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.045em] text-white">
              What's on
            </h1>
          </section>
        )}

        <div
          className={
            mobile
              ? "flex flex-1 flex-col space-y-5"
              : cn(BROWSE_CONTAINER_CLASS, "flex min-h-0 flex-1 flex-col space-y-5 py-2")
          }
        >
          <FullGuideBrowser
            seedChannels={guideChannels}
            seedReady={!favoritesLoading}
            mobile={mobile}
            onPlayChannel={openChannel}
          />
        </div>

        {!mobile ? (
          <p className={cn(BROWSE_CONTAINER_CLASS, "pb-6 pt-2 text-[12px] text-white/35")}>
            Guide data comes from your provider EPG and favorite channels.
          </p>
        ) : null}
      </main>
    </StreamPageShell>
  );
}
