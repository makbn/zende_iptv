"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  AppicaPage,
  AppicaRail,
  AppicaSection,
} from "@/components/layout/appica-page";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogMeta } from "@/features/iptv/catalog-context";
import { useContinueWatchingState } from "@/features/iptv/use-continue-watching";
import { useHomeCatalogShelves } from "@/features/iptv/use-home-catalog-shelves";
import { HomeShelfSkeleton } from "@/components/home/home-shelf-skeleton";

import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { Button, buttonVariants } from "@appica/ui-react/button";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { addFavorite } from "@/lib/favorites/favorites-store";
import {
  listRecentPlayback,
  listTopByPlayCount,
  removeViewingEntry,
  subscribeViewingStats,
  viewingEntryToChannel,
} from "@/lib/watch/viewing-stats";

const log = createClientLogger("shell.TvHome");

const source = BUILTIN_PLAYLIST_SOURCES[0]!;
const DEFAULT_RECOMMENDATION_LANGUAGE = "en";

function dedupeChannels(list: M3uChannel[]): M3uChannel[] {
  const seen = new Set<string>();
  const out: M3uChannel[] = [];
  for (const ch of list) {
    if (seen.has(ch.url)) continue;
    seen.add(ch.url);
    out.push(ch);
  }
  return out;
}

export function TvHome() {
  const router = useRouter();
  const { navigate, onNavigateClick } = useRemoteNavigation();
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const catalog = useCatalogMeta();

  const homeShelves = useHomeCatalogShelves({
    presetId: source.presetId,
    language: DEFAULT_RECOMMENDATION_LANGUAGE,
    discoverLimit: 36,
    movieLimit: 18,
    seriesLimit: 18,
  });

  const {
    channelCount,
    catalogLoaded,
    metaFailed,
    busy,
    refreshCatalog,
  } = catalog;

  const [statsEpoch, setStatsEpoch] = useState(0);

  useEffect(() => subscribeViewingStats(() => setStatsEpoch((n) => n + 1)), []);

  const shelfChannels = useMemo(() => {
    void statsEpoch;
    const recent = dedupeChannels(
      listRecentPlayback(18).map((e) => viewingEntryToChannel(e, [])),
    );
    const recentUrls = new Set(recent.map((c) => c.url));
    const frequent = dedupeChannels(
      listTopByPlayCount(18)
        .map((e) => viewingEntryToChannel(e, []))
        .filter((c) => !recentUrls.has(c.url)),
    );
    const skip = new Set([...recent, ...frequent].map((c) => c.url));
    const discover = homeShelves.discover.channels.filter((c) => !skip.has(c.url));
    return dedupeChannels([...recent, ...frequent, ...discover]);
  }, [statsEpoch, homeShelves.discover.channels]);

  useEffect(() => {
    if (!catalogLoaded) return;
    if (metaFailed) return;
    if ((channelCount ?? 0) === 0) {
      router.replace("/setup");
    }
  }, [catalogLoaded, channelCount, metaFailed, router]);

  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  const { items: continueWatching, loading: continueWatchingLoading } = useContinueWatchingState(18);

  const recentChannels = useMemo(() => {
    void statsEpoch;
    const entries = listRecentPlayback(18);
    const mapped = entries.map((e) => viewingEntryToChannel(e, shelfChannels));
    return dedupeChannels(mapped);
  }, [shelfChannels, statsEpoch]);

  const frequentChannels = useMemo(() => {
    void statsEpoch;
    const entries = listTopByPlayCount(18);
    const mapped = entries.map((e) => viewingEntryToChannel(e, shelfChannels));
    const recentUrls = new Set(recentChannels.map((c) => c.url));
    return dedupeChannels(mapped.filter((c) => !recentUrls.has(c.url)));
  }, [shelfChannels, statsEpoch, recentChannels]);


  function openContinueItem(item: (typeof continueWatching)[number]) {
    openChannel({
      ...item.channel,
      ...(item.playback ? { playback: item.playback } : {}),
    });
  }

  const discoverLiveSlice = useMemo(() => {
    const skip = new Set<string>([
      ...recentChannels.map((c) => c.url),
      ...frequentChannels.map((c) => c.url),
    ]);
    return homeShelves.discover.channels
      .filter((c) => !skip.has(c.url))
      .slice(0, 36);
  }, [homeShelves.discover.channels, recentChannels, frequentChannels]);

  const discoverMoviesSlice = useMemo(() => {
    const skip = new Set<string>([
      ...recentChannels.map((c) => c.url),
      ...frequentChannels.map((c) => c.url),
    ]);
    return dedupeChannels(homeShelves.movies.channels)
      .filter((c) => !skip.has(c.url))
      .slice(0, 36);
  }, [homeShelves.movies.channels, recentChannels, frequentChannels]);

  const discoverSeriesSlice = useMemo(() => {
    const skip = new Set<string>([
      ...recentChannels.map((c) => c.url),
      ...frequentChannels.map((c) => c.url),
    ]);
    return dedupeChannels(homeShelves.series.channels)
      .filter((c) => !skip.has(c.url))
      .slice(0, 36);
  }, [homeShelves.series.channels, recentChannels, frequentChannels]);

  const healthLookupChannels = useMemo(
    () => [
      ...shelfChannels,
      ...discoverMoviesSlice,
      ...discoverSeriesSlice,
    ],
    [shelfChannels, discoverMoviesSlice, discoverSeriesSlice],
  );
  const { getScoreForChannel } = useChannelHealthLookup(healthLookupChannels);

  if (metaFailed) {
    return (
      <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-4 px-6 pt-20 text-center text-foreground-intense">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Catalog offline</p>
        <p className="max-w-md text-[22px] font-semibold tracking-[-0.04em] text-foreground-intense">
          Could not reach the catalog server.
        </p>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void refreshCatalog()}
        >
          {busy ? <><ZendeSpinner size="tiny" label="Retrying" /> Retrying…</> : "Retry"}
        </Button>
      </div>
    );
  }

  if ((channelCount ?? 0) === 0) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center pt-20 text-foreground-intense">
        <p className="text-[15px] font-medium">Opening setup…</p>
      </div>
    );
  }

  return (
    <AppicaPage className="pt-20 md:pt-24">
      <div className="space-y-8 pb-10 sm:space-y-10 sm:pb-12">
        {continueWatchingLoading ? (
          <AppicaSection id="continue" eyebrow="Resume" title="Continue watching" description="Checking your saved progress.">
            <HomeShelfSkeleton />
          </AppicaSection>
        ) : continueWatching.length > 0 ? (
          <AppicaSection
            id="continue"
            eyebrow="Resume"
            title="Continue watching"
            description="Unfinished episodes, movies, and replays."
          >
            <AppicaRail>
              {continueWatching.map((item, i) => (
                <div key={`cw-${item.channel.url}-${i}`} className="relative w-[260px] shrink-0 snap-start sm:w-[288px]">
                  <TvChannelTile
                    channel={item.channel}
                    healthScore={getScoreForChannel(item.channel)}
                    onSelect={() => openContinueItem(item)}
                  />
                  <div
                    className="pointer-events-none absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-background-muted"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </AppicaRail>
          </AppicaSection>
        ) : null}

        {homeShelves.loading ? <HomeShelfSkeleton /> : null}



        {recentChannels.length > 0 ? (
          <AppicaSection
            id="recent"
            eyebrow="History"
            title="Recently watched"
            description="Channels you opened last."
          >
            <AppicaRail>
            {recentChannels.map((ch, i) => (
              <TvChannelTile
                key={`recent-${ch.url}-${i}`}
                channel={ch}
                healthScore={getScoreForChannel(ch)}
                onSelect={(c) => {
                  log.debug("Open from recent", { name: c.name });
                  openChannel(c);
                }}
                contextMenu={{
                  onPlay: () => {
                    log.debug("Play from recent menu", { name: ch.name });
                    openChannel(ch);
                  },
                  onAddFavorite: () => addFavorite(ch),
                  onRemoveFromRecent: () => removeViewingEntry(ch.url),
                }}
              />
            ))}
            </AppicaRail>
          </AppicaSection>
        ) : null}

        {frequentChannels.length > 0 ? (
          <AppicaSection
            id="frequent"
            eyebrow="Pattern"
            title="Because you watch"
            description="Your most played channels."
          >
            <AppicaRail>
            {frequentChannels.map((ch, i) => (
              <TvChannelTile
                key={`freq-${ch.url}-${i}`}
                channel={ch}
                healthScore={getScoreForChannel(ch)}
                onSelect={(c) => {
                  log.debug("Open from frequent", { name: c.name });
                  openChannel(c);
                }}
              />
            ))}
            </AppicaRail>
          </AppicaSection>
        ) : null}

        {discoverLiveSlice.length > 0 ? (
          <AppicaSection
            id="discover-live"
            eyebrow="Live"
            title="Discover Live TV"
            description="Explore live channels from your catalog."
          >
            <AppicaRail>
            {discoverLiveSlice.map((ch, i) => (
              <TvChannelTile
                key={`disc-live-${ch.url}-${i}`}
                channel={ch}
                healthScore={getScoreForChannel(ch)}
                onSelect={(c) => {
                  log.debug("Open from discover live", { name: c.name });
                  openChannel(c);
                }}
              />
            ))}
            </AppicaRail>
          </AppicaSection>
        ) : null}

        {discoverMoviesSlice.length > 0 ? (
          <AppicaSection
            id="discover-movies"
            eyebrow="Movies"
            title="Discover Movies"
            description="Explore movies from your catalog."
          >
            <AppicaRail>
            {discoverMoviesSlice.map((ch, i) => (
              <TvChannelTile
                key={`disc-movies-${ch.url}-${i}`}
                channel={ch}
                healthScore={getScoreForChannel(ch)}
                onSelect={(c) => {
                  log.debug("Open from discover movies", { name: c.name });
                  openChannel(c);
                }}
              />
            ))}
            </AppicaRail>
          </AppicaSection>
        ) : null}

        {discoverSeriesSlice.length > 0 ? (
          <AppicaSection
            id="discover-series"
            eyebrow="Series"
            title="Discover Series"
            description="Explore series from your catalog."
          >
            <AppicaRail>
            {discoverSeriesSlice.map((ch, i) => (
              <TvChannelTile
                key={`disc-series-${ch.url}-${i}`}
                channel={ch}
                healthScore={getScoreForChannel(ch)}
                onSelect={(c) => {
                  log.debug("Open from discover series", { name: c.name });
                  openChannel(c);
                }}
              />
            ))}
            </AppicaRail>
          </AppicaSection>
        ) : null}

        <AppicaSection
          eyebrow="Control"
          title="Need the full catalog?"
          description="Library has search, filters, compact lists, preview, and reliability badges for every stream."
        >
          <div className="border border-border bg-background-subtle shadow-sm flex flex-col items-start justify-between gap-4 rounded-lg p-5 sm:flex-row sm:items-center">
            <p className="text-[15px] leading-relaxed text-foreground-intense">
              <span className="font-medium text-foreground-intense">Library</span> has search,
              full lists, and reliability badges for every stream.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/library"
                onClick={onNavigateClick("/library")}
                className={buttonVariants({ variant: "secondary" })}
              >
                Open Library
              </Link>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void refreshCatalog()}
              >
                {busy ? <><ZendeSpinner size="tiny" label="Updating catalog" /> Updating…</> : "Refresh catalog"}
              </Button>
            </div>
          </div>
        </AppicaSection>
      </div>

      <footer className="border-t border-border py-10 text-center">
        <p className="text-[13px] leading-relaxed text-foreground-intense">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </AppicaPage>
  );
}
