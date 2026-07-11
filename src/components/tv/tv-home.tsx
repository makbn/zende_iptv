"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ZendeGlass } from "@/components/glass/zende-glass";
import {
  CinematicActionRow,
  CinematicButton,
  CinematicCommandPanel,
  CinematicHero,
  CinematicPage,
  CinematicRail,
  CinematicSection,
} from "@/components/layout/cinematic-v2";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import { TvContinueEmpty } from "@/components/tv/tv-continue-empty";
import { ZendeLogoWave } from "@/components/loading/zende-logo-wave";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogMeta } from "@/features/iptv/catalog-context";
import { useContinueWatchingItems } from "@/features/iptv/use-continue-watching";
import { useHomeCatalogShelves } from "@/features/iptv/use-home-catalog-shelves";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
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

  const continueWatching = useContinueWatchingItems(18);
  const coldStart = continueWatching.length === 0;

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

  const featured = useMemo(() => {
    void statsEpoch;
    const recentFirst = listRecentPlayback(1)[0];
    if (recentFirst) {
      return viewingEntryToChannel(recentFirst, shelfChannels);
    }
    const top = listTopByPlayCount(1)[0];
    if (top) {
      return viewingEntryToChannel(top, shelfChannels);
    }
    const withLogo = shelfChannels.find((c) => c.tvgLogo);
    return withLogo ?? shelfChannels[0];
  }, [shelfChannels, statsEpoch]);

  const hero = useMemo(() => {
    if (!featured) {
      return {
        eyebrow: "Zende",
        title: "Live TV",
        subtitle:
          "Your recently watched channels and favorites surface here after setup.",
        backdropUrl: null as string | null,
        primaryLabel: "Open Library",
        secondaryLabel: "Settings",
      };
    }
    return {
      eyebrow: featured.groupTitle ?? "Live TV",
      title: parseChannelLabel(featured.name?.trim() || "Channel").displayName,
      subtitle: "Resume, browse recent channels, or open the full catalog.",
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

  const discoverSlice = useMemo(() => {
    const skip = new Set<string>([
      ...recentChannels.map((c) => c.url),
      ...frequentChannels.map((c) => c.url),
    ]);
    return homeShelves.discover.channels
      .filter((c) => !skip.has(c.url))
      .slice(0, 36);
  }, [homeShelves.discover.channels, recentChannels, frequentChannels]);
  const recommendedMovies = useMemo(
    () => dedupeChannels(homeShelves.movies.channels).slice(0, 18),
    [homeShelves.movies.channels],
  );
  const recommendedSeries = useMemo(
    () => dedupeChannels(homeShelves.series.channels).slice(0, 18),
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

  if (!catalogLoaded) {
    return (
      <div className="zen-page-bg flex min-h-screen flex-col items-center justify-center gap-4 pt-20 text-white/45">
        <ZendeLogoWave size="md" />
        <p className="sr-only">Loading</p>
      </div>
    );
  }

  if (metaFailed) {
    return (
      <div className="zen-page-bg flex min-h-screen flex-col items-center justify-center gap-4 px-6 pt-20 text-center text-white/60">
        <p className="zen-kicker">Catalog offline</p>
        <p className="max-w-md text-[22px] font-semibold tracking-[-0.04em] text-white">
          Could not reach the catalog server.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refreshCatalog()}
          className="rounded-full bg-[var(--zen-frost)] px-5 py-2.5 text-[15px] font-semibold text-[var(--zen-void)] disabled:opacity-45"
        >
          {busy ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if ((channelCount ?? 0) === 0) {
    return (
      <div className="zen-page-bg flex min-h-screen items-center justify-center pt-20 text-white/45">
        <p className="text-[15px] font-medium">Opening setup…</p>
      </div>
    );
  }

  return (
    <CinematicPage className="pt-20 md:pt-24">
      <CinematicHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        description={hero.subtitle}
        aside={
          <CinematicCommandPanel className="max-w-[34rem] p-5">
            <p className="zen-kicker">
              {continueWatching.length > 0 ? "Resume" : "Start watching"}
            </p>
            <p className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.055em] text-white">
              {featured ? parseChannelLabel(featured.name?.trim() || "Channel").displayName : "Pick something good"}
            </p>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/52">
              {continueWatching.length > 0
                ? "Jump back in, or open Library when you want to browse by movies, shows, and live TV."
                : showColdStartRecommendations
                  ? "No history yet, so Home is starting with English movies and shows from your catalog."
                  : "Start from the featured item or open Library to browse by type, language, and category."}
            </p>
            <CinematicActionRow className="mt-5">
              <CinematicButton onClick={handlePrimary} disabled={busy}>
                {hero.primaryLabel}
              </CinematicButton>
              <CinematicButton
                type="button"
                variant="secondary"
                onClick={handleSecondary}
                disabled={busy}
              >
                {hero.secondaryLabel}
              </CinematicButton>
            </CinematicActionRow>
          </CinematicCommandPanel>
        }
      />

      <div className="space-y-8 pb-10 sm:space-y-10 sm:pb-12">
        {continueWatching.length > 0 ? (
          <CinematicSection
            id="continue"
            eyebrow="Resume"
            title="Continue watching"
            description="Unfinished episodes, movies, and replays."
          >
            <CinematicRail>
              {continueWatching.map((item, i) => (
                <div key={`cw-${item.channel.url}-${i}`} className="relative w-[260px] shrink-0 snap-start sm:w-[288px]">
                  <TvChannelTile
                    channel={item.channel}
                    healthScore={getScoreForChannel(item.channel)}
                    onSelect={() => openContinueItem(item)}
                  />
                  <div
                    className="pointer-events-none absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/15"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-[var(--zen-signal)]"
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CinematicRail>
          </CinematicSection>
        ) : showColdStartRecommendations ? null : (
          <CinematicSection
            id="continue"
            eyebrow="Resume"
            title="Continue watching"
            description="Unfinished episodes, movies, and replays."
          >
            <CinematicRail>
              <TvContinueEmpty />
            </CinematicRail>
          </CinematicSection>
        )}

        {showColdStartRecommendations && recommendedMovies.length > 0 ? (
          <CinematicSection
            id="recommended-movies"
            eyebrow="Start here"
            title="English movies to try"
            description="A curated first row from your English on-demand catalog."
          >
            <CinematicRail>
              {recommendedMovies.map((ch, i) => (
                <TvChannelTile
                  key={`movie-rec-${ch.url}-${i}`}
                  channel={ch}
                  healthScore={getScoreForChannel(ch)}
                  onSelect={(c) => {
                    log.debug("Open recommended movie", { name: c.name });
                    openChannel(c);
                  }}
                />
              ))}
            </CinematicRail>
          </CinematicSection>
        ) : null}

        {showColdStartRecommendations && recommendedSeries.length > 0 ? (
          <CinematicSection
            id="recommended-series"
            eyebrow="Binge row"
            title="English shows to sample"
            description="Series suggestions appear here before your watch history exists."
          >
            <CinematicRail>
              {recommendedSeries.map((ch, i) => (
                <TvChannelTile
                  key={`series-rec-${ch.url}-${i}`}
                  channel={ch}
                  healthScore={getScoreForChannel(ch)}
                  onSelect={(c) => {
                    log.debug("Open recommended series", { name: c.name });
                    openChannel(c);
                  }}
                />
              ))}
            </CinematicRail>
          </CinematicSection>
        ) : null}

        {recentChannels.length > 0 ? (
          <CinematicSection
            id="recent"
            eyebrow="History"
            title="Recently watched"
            description="Channels you opened last."
          >
            <CinematicRail>
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
            </CinematicRail>
          </CinematicSection>
        ) : (
          <CinematicSection
            id="recent"
            eyebrow="History"
            title="Recently watched"
            description="Channels you play will appear here."
          >
            <div className="flex w-[min(100vw-3rem,420px)] shrink-0 snap-start flex-col justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-7 py-10 ring-1 ring-white/[0.04]">
              <p className="text-[17px] font-semibold text-white">Nothing here yet</p>
              <p className="mt-2 text-[15px] leading-relaxed text-white/48">
                Start something from{" "}
                <Link
                  href="/library"
                  onClick={onNavigateClick("/library")}
                  className="font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  Library
                </Link>{" "}
                or press Play above — your lineup builds automatically.
              </p>
            </div>
          </CinematicSection>
        )}

        {frequentChannels.length > 0 ? (
          <CinematicSection
            id="frequent"
            eyebrow="Pattern"
            title="Because you watch"
            description="Your most played channels."
          >
            <CinematicRail>
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
            </CinematicRail>
          </CinematicSection>
        ) : null}

        <CinematicSection
          id="live"
          eyebrow="Live"
          title="Discover"
          description={
            channelCount != null
              ? `${channelCount.toLocaleString()} channels in your catalog.`
              : "Explore live channels from your catalog."
          }
        >
          <CinematicRail>
          {discoverSlice.map((ch, i) => (
            <TvChannelTile
              key={`disc-${ch.url}-${i}`}
              channel={ch}
              healthScore={getScoreForChannel(ch)}
              onSelect={(c) => {
                log.debug("Open from discover", { name: c.name });
                openChannel(c);
              }}
            />
          ))}
          </CinematicRail>
        </CinematicSection>

        <CinematicSection
          eyebrow="Control"
          title="Need the full catalog?"
          description="Library has search, filters, compact lists, preview, and reliability badges for every stream."
        >
          <div className="zen-panel flex flex-col items-start justify-between gap-4 rounded-[32px] p-5 sm:flex-row sm:items-center">
            <p className="text-[15px] leading-relaxed text-white/55">
              <span className="font-medium text-white/80">Library</span> has search,
              full lists, and reliability badges for every stream.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/library"
                onClick={onNavigateClick("/library")}
                className="group inline-flex shrink-0 outline-none"
              >
                <ZendeGlass
                  variant="ctaPill"
                  className="transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.98]"
                >
                  <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                    Open Library
                  </span>
                </ZendeGlass>
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCatalog()}
                className="group inline-flex shrink-0 border-0 bg-transparent p-0 outline-none disabled:opacity-40"
              >
                <ZendeGlass variant="heroSecondary" className="inline-block">
                  <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-white">
                    {busy ? "Updating…" : "Refresh catalog"}
                  </span>
                </ZendeGlass>
              </button>
            </div>
          </div>
        </CinematicSection>
      </div>

      <footer className="border-t border-white/[0.06] py-10 text-center">
        <p className="text-[13px] leading-relaxed text-white/35">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </CinematicPage>
  );
}
