"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { Button, buttonVariants } from "@appica/ui-react/button";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { useCatalogMeta } from "@/features/iptv/catalog-context";
import { useContinueWatchingState } from "@/features/iptv/use-continue-watching";
import { useHomeCatalogShelves } from "@/features/iptv/use-home-catalog-shelves";
import { HomeShelfSkeleton } from "@/components/home/home-shelf-skeleton";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import {
  listRecentPlayback,
  listTopByPlayCount,
  subscribeViewingStats,
  viewingEntryToChannel,
} from "@/lib/watch/viewing-stats";

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

function MobileShelf({
  id,
  title,
  description,
  channels,
  getScoreForChannel,
  onSelect,
}: {
  id?: string;
  title: string;
  description: string;
  channels: M3uChannel[];
  getScoreForChannel: ReturnType<typeof useChannelHealthLookup>["getScoreForChannel"];
  onSelect: (channel: M3uChannel) => void;
}) {
  if (channels.length === 0) return null;

  return (
    <section
      id={id}
      className="scroll-mt-24 motion-reduce:animate-none motion-reduce:opacity-100"
      aria-label={title}
    >
      <div className="px-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground-intense">
          {title}
        </h2>
        <p className="mt-1 max-w-[34ch] text-[13px] leading-snug text-foreground-intense">
          {description}
        </p>
      </div>
      <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:gap-3.5">
        {channels.map((channel, index) => (
          <MobileChannelCard
            key={`${title}-${channel.url}-${index}`}
            channel={channel}
            healthScore={getScoreForChannel(channel)}
            onSelect={onSelect}
            className="w-[44vw] min-w-[148px] max-w-[178px] shrink-0 snap-start sm:w-[30vw] sm:max-w-[190px]"
          />
        ))}
      </div>
    </section>
  );
}

export function MobileHome() {
  const router = useRouter();
  const { onNavigateClick } = useRemoteNavigation();
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const catalog = useCatalogMeta();
  const homeShelves = useHomeCatalogShelves({
    presetId: source.presetId,
    language: DEFAULT_RECOMMENDATION_LANGUAGE,
    discoverLimit: 18,
    movieLimit: 18,
    seriesLimit: 18,
  });
  const {
    busy,
    channelCount,
    refreshCatalog,
    catalogLoaded,
    metaFailed,
  } = catalog;
  const [statsEpoch, setStatsEpoch] = useState(0);

  useEffect(() => subscribeViewingStats(() => setStatsEpoch((n) => n + 1)), []);

  const shelfChannels = useMemo(() => {
    void statsEpoch;
    const recent = dedupeChannels(
      listRecentPlayback(12).map((entry) => viewingEntryToChannel(entry, [])),
    );
    const recentUrls = new Set(recent.map((c) => c.url));
    const frequent = dedupeChannels(
      listTopByPlayCount(12)
        .map((entry) => viewingEntryToChannel(entry, []))
        .filter((c) => !recentUrls.has(c.url)),
    );
    const skip = new Set([...recent, ...frequent].map((c) => c.url));
    const discover = homeShelves.discover.channels.filter((c) => !skip.has(c.url));
    return dedupeChannels([...recent, ...frequent, ...discover]);
  }, [statsEpoch, homeShelves.discover.channels]);

  useEffect(() => {
    if (!catalogLoaded) return;
    if (metaFailed) return;
    if ((channelCount ?? 0) === 0) router.replace("/setup");
  }, [catalogLoaded, channelCount, metaFailed, router]);

  const recentChannels = useMemo(() => {
    void statsEpoch;
    return dedupeChannels(
      listRecentPlayback(12).map((entry) => viewingEntryToChannel(entry, shelfChannels)),
    );
  }, [shelfChannels, statsEpoch]);

  const frequentChannels = useMemo(() => {
    void statsEpoch;
    const recentUrls = new Set(recentChannels.map((channel) => channel.url));
    return dedupeChannels(
      listTopByPlayCount(12)
        .map((entry) => viewingEntryToChannel(entry, shelfChannels))
        .filter((channel) => !recentUrls.has(channel.url)),
    );
  }, [shelfChannels, recentChannels, statsEpoch]);

  const discoverLiveSlice = useMemo(() => {
    const skip = new Set([
      ...recentChannels.map((channel) => channel.url),
      ...frequentChannels.map((channel) => channel.url),
    ]);
    return homeShelves.discover.channels
      .filter((c) => !skip.has(c.url))
      .slice(0, 18);
  }, [homeShelves.discover.channels, frequentChannels, recentChannels]);

  const { items: continueWatching, loading: continueWatchingLoading } = useContinueWatchingState(12);
  const discoverMoviesSlice = useMemo(() => {
    const skip = new Set([
      ...recentChannels.map((channel) => channel.url),
      ...frequentChannels.map((channel) => channel.url),
    ]);
    return dedupeChannels(homeShelves.movies.channels)
      .filter((channel) => !skip.has(channel.url))
      .slice(0, 18);
  }, [homeShelves.movies.channels, frequentChannels, recentChannels]);
  const discoverSeriesSlice = useMemo(() => {
    const skip = new Set([
      ...recentChannels.map((channel) => channel.url),
      ...frequentChannels.map((channel) => channel.url),
    ]);
    return dedupeChannels(homeShelves.series.channels)
      .filter((channel) => !skip.has(channel.url))
      .slice(0, 18);
  }, [homeShelves.series.channels, frequentChannels, recentChannels]);
  const healthLookupChannels = useMemo(
    () => [
      ...shelfChannels,
      ...discoverLiveSlice,
      ...discoverMoviesSlice,
      ...discoverSeriesSlice,
    ],
    [shelfChannels, discoverLiveSlice, discoverMoviesSlice, discoverSeriesSlice],
  );
  const { getScoreForChannel } = useChannelHealthLookup(healthLookupChannels);

  function openContinueItem(item: (typeof continueWatching)[number]) {
    openChannel({
      ...item.channel,
      ...(item.playback ? { playback: item.playback } : {}),
    });
  }

  if (metaFailed) {
    return (
      <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center text-foreground-intense">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Catalog offline</p>
        <p className="max-w-sm text-[21px] font-semibold tracking-[-0.04em] text-foreground-intense">
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
      <div className="bg-background flex min-h-screen items-center justify-center px-4 text-foreground-intense">
        <p className="text-[15px] font-medium">Opening setup…</p>
      </div>
    );
  }

  return (
    <main className="bg-background min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <div className="relative z-10 space-y-6 px-0 pt-4">
        {continueWatching.length > 0 ? (
          <MobileShelf
            id="continue"
            title="Continue Watching"
            description="Resume where you left off on this device."
            channels={continueWatching.map((item) => item.channel)}
            getScoreForChannel={getScoreForChannel}
            onSelect={(channel) => {
              const item = continueWatching.find((entry) => entry.channel.url === channel.url);
              if (item) {
                openContinueItem(item);
                return;
              }
              openChannel(channel);
            }}
          />
        ) : null}
        {continueWatchingLoading ? (
          <section className="px-4" aria-label="Loading Continue Watching">
            <HomeShelfSkeleton compact />
          </section>
        ) : null}

        {homeShelves.loading ? <HomeShelfSkeleton compact /> : null}

        <MobileShelf
          id="recent"
          title="Recently Watched"
          description="Pick up from channels opened on this device."
          channels={recentChannels}
          getScoreForChannel={getScoreForChannel}
          onSelect={openChannel}
        />

        <MobileShelf
          title="Because You Watch"
          description="A quick row for channels you return to often."
          channels={frequentChannels}
          getScoreForChannel={getScoreForChannel}
          onSelect={openChannel}
        />

        <MobileShelf
          id="discover-live"
          title="Discover Live TV"
          description="Explore live channels from your catalog."
          channels={discoverLiveSlice}
          getScoreForChannel={getScoreForChannel}
          onSelect={openChannel}
        />

        <MobileShelf
          id="discover-movies"
          title="Discover Movies"
          description="Explore movies from your catalog."
          channels={discoverMoviesSlice}
          getScoreForChannel={getScoreForChannel}
          onSelect={openChannel}
        />

        <MobileShelf
          id="discover-series"
          title="Discover Series"
          description="Explore series from your catalog."
          channels={discoverSeriesSlice}
          getScoreForChannel={getScoreForChannel}
          onSelect={openChannel}
        />

        <section className="px-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background-muted p-4">
            <p className="text-[14px] leading-relaxed text-foreground-intense">
              Search, filters, and reliability badges live in the full Library.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/library"
                onClick={onNavigateClick("/library")}
                className={buttonVariants({ variant: "secondary", className: "w-full" })}
              >
                Open Library
              </Link>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void refreshCatalog()}
                className="w-full"
              >
                <RefreshCw className="size-4" aria-hidden />
                {busy ? "Updating" : "Refresh"}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <footer className="mt-8 border-t border-border px-4 py-8 text-center">
        <p className="text-[12px] leading-relaxed text-foreground-intense">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>

      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </main>
  );
}
