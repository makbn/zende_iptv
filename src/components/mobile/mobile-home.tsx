"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  CinematicButton,
  CinematicCommandPanel,
} from "@/components/layout/cinematic-v2";
import { TvContinueEmpty } from "@/components/tv/tv-continue-empty";
import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { useCatalogMeta } from "@/features/iptv/catalog-context";
import { useContinueWatchingItems } from "@/features/iptv/use-continue-watching";
import { useHomeCatalogShelves } from "@/features/iptv/use-home-catalog-shelves";
import { parseChannelLabel } from "@/lib/channel/channel-label";
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
      className="scroll-mt-24 motion-safe:animate-zen-row-lift motion-reduce:animate-none motion-reduce:opacity-100"
      aria-label={title}
    >
      <div className="px-4">
        <h2 className="zen-section-title">
          {title}
        </h2>
        <p className="mt-1 max-w-[34ch] text-[13px] leading-snug text-white/52">
          {description}
        </p>
      </div>
      <div className="tv-row-scroll zen-stagger-row mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:gap-3.5">
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
  const { navigate, onNavigateClick } = useRemoteNavigation();
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const catalog = useCatalogMeta();
  const homeShelves = useHomeCatalogShelves({
    presetId: source.presetId,
    language: DEFAULT_RECOMMENDATION_LANGUAGE,
    discoverLimit: 18,
    movieLimit: 12,
    seriesLimit: 12,
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

  const discoverSlice = useMemo(() => {
    const skip = new Set([
      ...recentChannels.map((channel) => channel.url),
      ...frequentChannels.map((channel) => channel.url),
    ]);
    return homeShelves.discover.channels
      .filter((c) => !skip.has(c.url))
      .slice(0, 18);
  }, [homeShelves.discover.channels, frequentChannels, recentChannels]);

  const featured = useMemo(() => {
    void statsEpoch;
    const recentFirst = listRecentPlayback(1)[0];
    if (recentFirst) return viewingEntryToChannel(recentFirst, shelfChannels);
    const top = listTopByPlayCount(1)[0];
    if (top) return viewingEntryToChannel(top, shelfChannels);
    return shelfChannels.find((channel) => channel.tvgLogo) ?? shelfChannels[0];
  }, [shelfChannels, statsEpoch]);

  const continueWatching = useContinueWatchingItems(12);
  const coldStart = continueWatching.length === 0;
  const recommendedMovies = useMemo(
    () => dedupeChannels(homeShelves.movies.channels).slice(0, 12),
    [homeShelves.movies.channels],
  );
  const recommendedSeries = useMemo(
    () => dedupeChannels(homeShelves.series.channels).slice(0, 12),
    [homeShelves.series.channels],
  );
  const hasColdStartRecommendations =
    recommendedMovies.length > 0 || recommendedSeries.length > 0;
  const showColdStartRecommendations =
    coldStart &&
    recentChannels.length === 0 &&
    frequentChannels.length === 0 &&
    hasColdStartRecommendations;
  const healthLookupChannels = useMemo(
    () => [
      ...shelfChannels,
      ...recommendedMovies,
      ...recommendedSeries,
    ],
    [shelfChannels, recommendedMovies, recommendedSeries],
  );
  const { getScoreForChannel } = useChannelHealthLookup(healthLookupChannels);

  const hero = useMemo(() => {
    if (!featured) {
      return {
        eyebrow: "Zende",
        title: "Live TV",
        subtitle: "Your recently watched channels surface here after setup.",
        backdropUrl: null as string | null,
        primaryLabel: "Open Library",
        secondaryLabel: "Settings",
      };
    }
    return {
      eyebrow: featured.groupTitle ?? "Live TV",
      title: parseChannelLabel(featured.name?.trim() || "Channel").displayName,
      subtitle:
        "Jump back in, browse what you watch often, or explore something new.",
      backdropUrl: featured.tvgLogo ?? null,
      primaryLabel: "Play",
      secondaryLabel: "Library",
    };
  }, [featured]);

  function handlePrimary() {
    if (busy) return;
    if (!featured) {
      navigate("/library");
      return;
    }
    openChannel(featured);
  }

  function handleSecondary() {
    if (!featured) {
      navigate("/settings");
      return;
    }
    navigate("/library");
  }

  function openContinueItem(item: (typeof continueWatching)[number]) {
    openChannel({
      ...item.channel,
      ...(item.playback ? { playback: item.playback } : {}),
    });
  }

  if (!catalogLoaded) {
    return (
      <div className="zen-page-bg flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-white/45">
        <ZendeLoadingState size="full" label="Loading home" />
      </div>
    );
  }

  if (metaFailed) {
    return (
      <div className="zen-page-bg flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center text-white/60">
        <p className="zen-kicker">Catalog offline</p>
        <p className="max-w-sm text-[21px] font-semibold tracking-[-0.04em] text-white">
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
      <div className="zen-page-bg flex min-h-screen items-center justify-center px-4 text-white/45">
        <p className="text-[15px] font-medium">Opening setup…</p>
      </div>
    );
  }

  return (
    <main className="zen-page-bg min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4 pb-4">
        <CinematicCommandPanel className="rounded-[24px] p-4">
          <p className="zen-kicker">{hero.eyebrow}</p>
          <h1 className="mt-2 text-[clamp(1.75rem,8vw,2.7rem)] font-semibold leading-[0.95] tracking-[-0.065em] text-white">
            {hero.title}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/54">
            {hero.subtitle}
          </p>
          <p className="mt-3 rounded-[18px] border border-white/[0.09] bg-black/25 px-3 py-2 text-[12px] font-medium leading-relaxed text-white/48">
            {continueWatching.length > 0
              ? "Pick up where you left off or jump into Library."
              : showColdStartRecommendations
                ? "No history yet, so we’re starting with English movies and shows."
                : "Start from the featured item or browse by type in Library."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <CinematicButton onClick={handlePrimary} disabled={busy}>
              {hero.primaryLabel}
            </CinematicButton>
            <CinematicButton
              variant="normal"
              onClick={handleSecondary}
              disabled={busy}
            >
              {hero.secondaryLabel}
            </CinematicButton>
          </div>
        </CinematicCommandPanel>
      </section>

      <div className="relative z-10 space-y-6 px-0">
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
        {continueWatching.length === 0 && !showColdStartRecommendations ? (
          <section className="px-4" aria-label="Continue Watching">
            <TvContinueEmpty />
          </section>
        ) : null}

        {showColdStartRecommendations ? (
          <>
            <MobileShelf
              id="recommended-movies"
              title="English movies to try"
              description="A first row from your English on-demand catalog."
              channels={recommendedMovies}
              getScoreForChannel={getScoreForChannel}
              onSelect={openChannel}
            />
            <MobileShelf
              id="recommended-series"
              title="English shows to sample"
              description="Series suggestions before your watch history exists."
              channels={recommendedSeries}
              getScoreForChannel={getScoreForChannel}
              onSelect={openChannel}
            />
          </>
        ) : null}

        <MobileShelf
          id="recent"
          title="Recently Watched"
          description="Pick up from channels opened on this device."
          channels={recentChannels}
          getScoreForChannel={getScoreForChannel}
          onSelect={openChannel}
        />

        {recentChannels.length === 0 ? (
          <section className="px-4" aria-label="Recently Watched">
            <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.04] p-5">
              <h2 className="text-[19px] font-semibold text-white">
                Nothing watched yet
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-white/48">
                Start from Library or tap Play above. Your quick-return row will
                appear here.
              </p>
            </div>
          </section>
        ) : null}

        <MobileShelf
          title="Because You Watch"
          description="A quick row for channels you return to often."
          channels={frequentChannels}
          getScoreForChannel={getScoreForChannel}
          onSelect={openChannel}
        />

        <MobileShelf
          id="live"
          title="Discover"
          description={
            channelCount != null
              ? `${channelCount.toLocaleString()} channels in your catalog.`
              : "Explore live channels from your catalog."
          }
          channels={discoverSlice}
          getScoreForChannel={getScoreForChannel}
          onSelect={openChannel}
        />

        <section className="px-4">
          <div className="flex flex-col gap-3 rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-4">
            <p className="text-[14px] leading-relaxed text-white/48">
              Search, filters, and reliability badges live in the full Library.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/library"
                onClick={onNavigateClick("/library")}
                className={buttonVariants({ variant: "normal", className: "w-full" })}
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

      <footer className="mt-8 border-t border-white/[0.06] px-4 py-8 text-center">
        <p className="text-[12px] leading-relaxed text-white/35">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>

      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </main>
  );
}
