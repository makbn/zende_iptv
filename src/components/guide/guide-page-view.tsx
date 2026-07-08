"use client";

import Link from "next/link";

import { FavoritesEpgTimeline } from "@/components/tv/favorites-epg-timeline";
import {
  CinematicCommandPanel,
  CinematicHero,
  CinematicMetrics,
} from "@/components/layout/cinematic-v2";
import {
  POSTER_GRID_CLASS,
  POSTER_GRID_TILE_CLASS,
} from "@/components/layout/browse-page-shell";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import {
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useEnrichedFavorites } from "@/features/iptv/use-enriched-favorites";
import { useLibraryCatalog } from "@/features/iptv/use-library-catalog";
import { listFavorites, subscribeFavorites } from "@/lib/favorites/favorites-store";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { cn } from "@/lib/utils";
import { Loader2, Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

export function GuidePageView({ mobile = false }: { mobile?: boolean }) {
  const { openChannel } = useWatchNavigation();
  const [favEpoch, setFavEpoch] = useState(0);

  useEffect(() => subscribeFavorites(() => setFavEpoch((n) => n + 1)), []);

  void favEpoch;
  const rawFavorites = listFavorites();
  const enrichedFavorites = useEnrichedFavorites();

  const favoritesChannels = useMemo(() => {
    const byUrl = new Map(enrichedFavorites.map((ch) => [ch.url, ch]));
    return rawFavorites.map(
      (f) => byUrl.get(f.url) ?? { url: f.url, name: f.name, duration: -1 },
    );
  }, [enrichedFavorites, rawFavorites]);

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

  const { getScoreForChannel } = useChannelHealthLookup(shelf);

  const padClass = mobile ? "pb-28 pt-[5.35rem]" : cn("pb-28", TV_BROWSE_TOP_PAD_CLASS);

  return (
    <div className={cn("zen-page-bg min-h-screen text-foreground", padClass)}>
      <main className={mobile ? "px-4" : undefined}>
        {!mobile ? (
          <CinematicHero
            className="pb-8 pt-8"
            eyebrow="Guide"
            title="TV guide"
            description="Favorites first, with live channels below."
            aside={
              <CinematicCommandPanel>
                <p className="zen-kicker">Guide status</p>
                <CinematicMetrics
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
                <p className="mt-5 text-[14px] leading-relaxed text-white/56">
                  Add favorites from Library to keep the guide focused.
                </p>
              </CinematicCommandPanel>
            }
          />
        ) : (
          <section className="zen-card mb-4 rounded-[24px] px-4 py-3">
            <p className="zen-kicker text-[10px]">
              Guide
            </p>
            <h1 className="mt-1 text-[1.45rem] font-semibold tracking-[-0.055em] text-white">TV guide</h1>
            <p className="mt-2 text-[12px] text-white/50">
              Favorites first — scroll for now & next.
            </p>
          </section>
        )}

        <div
          className={
            mobile
              ? "space-y-6"
              : "mx-auto max-w-[1920px] space-y-10 px-6 sm:px-10 lg:px-14 xl:px-20"
          }
        >
          {favoritesChannels.length > 0 ? (
            <FavoritesEpgTimeline
              channels={favoritesChannels}
              onSelectChannel={openChannel}
              className={mobile ? undefined : "w-full"}
            />
          ) : (
            <ZenedeGlass variant="panel" className="p-6 text-center">
              <Radio className="mx-auto mb-3 size-8 text-[var(--zen-signal)]/60" aria-hidden />
              <p className="text-[22px] font-semibold tracking-[-0.04em] text-white">No favorites yet</p>
              <p className="zen-body-muted mt-2 text-[14px]">
                Star channels in Library — they appear first on this guide.
              </p>
              <Link
                href="/favorites"
                className="mt-4 inline-flex rounded-full bg-[var(--zen-frost)] px-5 py-2 text-[14px] font-semibold text-[var(--zen-void)]"
              >
                Open Favorites
              </Link>
            </ZenedeGlass>
          )}

          {discoverLive.length > 0 ? (
            <section aria-label="More live channels">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="zen-section-title sm:text-[22px]">
                    More live
                  </h2>
                  <p className="mt-1 text-[13px] text-white/52">
                    Additional channels from your catalog.
                  </p>
                </div>
                {liveCatalog.loading ? (
                  <Loader2 className="size-5 animate-spin text-white/40" aria-hidden />
                ) : null}
              </div>
              <div className={cn(mobile ? "grid grid-cols-1 gap-3" : POSTER_GRID_CLASS)}>
                {discoverLive.map((ch, i) => (
                  <TvChannelTile
                    key={`${ch.url}-${i}`}
                    channel={ch}
                    healthScore={getScoreForChannel(ch)}
                    onSelect={openChannel}
                    className={POSTER_GRID_TILE_CLASS}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>

      {!mobile ? (
        <footer className="mt-10 border-t border-white/[0.06] py-10 text-center">
          <p className="text-[13px] text-white/35">
            Guide data from iptv-org / XMLTV sources when tvg-id is present.
          </p>
        </footer>
      ) : null}
    </div>
  );
}
