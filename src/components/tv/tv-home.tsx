"use client";

import { Button, buttonVariants } from "@appica/ui-react/button";
import { Info, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { gradientFromChannelName } from "@/components/channels/channel-presentation";
import { AppicaPage } from "@/components/layout/appica-page";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useCatalogMeta } from "@/features/iptv/catalog-context";
import {
  useContinueWatchingState,
  type ContinueWatchingItem,
} from "@/features/iptv/use-continue-watching";
import { useHomeCatalogShelves } from "@/features/iptv/use-home-catalog-shelves";
import { useHomeHeroMetadata } from "@/features/iptv/use-home-hero-metadata";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import type { MediaMetadata } from "@/lib/media/media-metadata";
import { buildShowPageHref } from "@/lib/navigation/show-page";
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

type HomeFeature = {
  channel: M3uChannel;
  playback?: ContinueWatchingItem["playback"];
  progress?: number;
  positionSeconds?: number;
  source: "continue" | "catalog";
};

function dedupeChannels(list: M3uChannel[]): M3uChannel[] {
  const seen = new Set<string>();
  return list.filter((channel) => {
    if (seen.has(channel.url)) return false;
    seen.add(channel.url);
    return true;
  });
}

function interleaveChannels(...groups: M3uChannel[][]): M3uChannel[] {
  const result: M3uChannel[] = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (group[index]) result.push(group[index]);
    }
  }
  return dedupeChannels(result);
}

function featureFromContinue(item: ContinueWatchingItem): HomeFeature {
  return {
    channel: item.channel,
    ...(item.playback ? { playback: item.playback } : {}),
    progress: item.progress,
    positionSeconds: item.positionSeconds,
    source: "continue",
  };
}

function featureFromChannel(channel: M3uChannel): HomeFeature {
  return { channel, source: "catalog" };
}

function cleanCatalogText(value: string): string {
  return value
    .replace(/^\s*(?:[\u{1F1E6}-\u{1F1FF}]{2}\s*)+/u, "")
    .replace(/^\s*\[[A-Z]{2,3}\]\s*/i, "")
    .replace(/^\s*[A-Z]{2,4}\s*[:|·-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayTitle(feature: HomeFeature): string {
  const rawTitle = feature.playback?.seriesTitle?.trim() || feature.channel.name?.trim() || "Untitled";
  const cleanTitle = cleanCatalogText(rawTitle)
    .replace(/\s*(?:[-–—|]\s*)?S\d{1,2}E\d{1,3}\b.*$/i, "")
    .replace(/\s+(?:19|20)\d{2}\s*$/i, "")
    .trim();
  return parseChannelLabel(cleanTitle || rawTitle).displayName;
}

function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function featureMeta(feature: HomeFeature): string {
  const parts: string[] = [];
  const { playback } = feature;
  if (playback?.season || playback?.episodeNum) {
    const season = playback.season ? `S${playback.season}` : "";
    const episode = playback.episodeNum ? `E${playback.episodeNum}` : "";
    parts.push([season, episode].filter(Boolean).join(" "));
  } else if (playback?.year) {
    parts.push(playback.year);
  } else {
    const parsed = parseChannelLabel(feature.channel.name ?? "");
    if (parsed.yearLabel) parts.push(parsed.yearLabel);
  }
  const episodeTitle = playback?.episodeTitle?.trim();
  if (episodeTitle && !/^S\d{1,2}E\d{1,3}$/i.test(episodeTitle)) {
    parts.push(cleanCatalogText(episodeTitle));
  }
  if (feature.source === "continue" && playback?.durationSeconds && feature.positionSeconds != null) {
    parts.push(`${formatMinutes(Math.max(60, playback.durationSeconds - feature.positionSeconds))} left`);
  } else if (playback?.durationSeconds) {
    parts.push(formatMinutes(playback.durationSeconds));
  } else if (feature.channel.groupTitle?.trim()) {
    const group = cleanCatalogText(feature.channel.groupTitle);
    parts.push(group.replace(/\b(series|movies?|live)\b/gi, (label) =>
      label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
    ));
  }
  return parts.filter(Boolean).slice(0, 3).join("  •  ");
}

function featureDescription(feature: HomeFeature): string {
  if (feature.channel.description?.trim()) return feature.channel.description.trim();
  if (feature.source === "continue") {
    return `Pick up ${displayTitle(feature)} right where you left off.`;
  }
  const contentType = resolveLibraryContentType(feature.channel);
  if (contentType === "live") return "Tune in live from your Zende channel lineup.";
  return "Discover this title from your Zende library and settle in for the next chapter.";
}

function artworkUrl(channel: M3uChannel): string | undefined {
  return secureImageUrl(channel.homeMetadata?.posterUrl || channel.tvgLogo, undefined, "poster");
}

function HomeHero({
  feature,
  metadata,
  onPrimary,
  onMoreInfo,
}: {
  feature: HomeFeature | null;
  metadata: MediaMetadata | null;
  onPrimary: () => void;
  onMoreInfo: () => void;
}) {
  const art = secureImageUrl(
    metadata?.backdropUrl || feature?.channel.tvgLogo,
    undefined,
    metadata?.backdropUrl ? "poster" : "thumbnail",
  );
  const title = metadata?.title || (feature ? displayTitle(feature) : "Everything you love, one screen away");
  const meta = feature
    ? feature.source === "continue"
      ? featureMeta(feature)
      : [metadata?.year, metadata?.contentRating, metadata?.runtimeMinutes ? `${metadata.runtimeMinutes} min` : null]
          .filter(Boolean)
          .join("  •  ") || featureMeta(feature)
    : "Live TV  •  Movies  •  Series";
  const description = feature
    ? metadata?.overview || featureDescription(feature)
    : "Your Zende library becomes a cinematic, couch-first experience.";

  return (
    <section className="tv-home-hero" aria-labelledby="tv-home-hero-title">
      <div className="tv-home-hero-art" aria-hidden>
        {art ? (
          <>
            <img className="tv-home-hero-art-blur" src={art} alt="" />
            <img className="tv-home-hero-art-image" src={art} alt="" />
          </>
        ) : (
          <div
            className="tv-home-hero-art-fallback"
            style={{ background: gradientFromChannelName(title) }}
          />
        )}
      </div>
      <div className="tv-home-hero-shade" aria-hidden />

      <div className="tv-home-hero-content">
        <p className="tv-home-hero-eyebrow">
          {feature?.source === "continue" ? "Continue Watching" : "Featured on Zende"}
        </p>
        <h1 id="tv-home-hero-title">{title}</h1>
        <p className="tv-home-hero-meta">{meta}</p>
        <p className="tv-home-hero-description">{description}</p>
        <div
          className="tv-home-hero-actions"
          data-tv-layout="horizontal"
          data-tv-skip-initial
        >
          <Button
            type="button"
            size="lg"
            className="tv-home-hero-primary"
            onClick={onPrimary}
            disabled={!feature}
          >
            <Play aria-hidden fill="currentColor" />
            {feature?.source === "continue" ? "Resume" : "Watch Now"}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="tv-home-hero-secondary"
            onClick={onMoreInfo}
            disabled={!feature}
          >
            <Info aria-hidden />
            More Info
          </Button>
        </div>
      </div>

      <div className="tv-home-hero-dots" aria-hidden>
        {[0, 1, 2, 3].map((dot) => (
          <span key={dot} className={dot === 0 ? "is-active" : undefined} />
        ))}
      </div>
    </section>
  );
}

function HomeMediaCard({
  feature,
  progress,
  metadata,
  initialFocus = false,
  compact = false,
  onSelect,
  onFocus,
}: {
  feature: HomeFeature;
  progress?: number;
  metadata?: string;
  initialFocus?: boolean;
  compact?: boolean;
  onSelect: () => void;
  onFocus: () => void;
}) {
  const title = displayTitle(feature);
  const art = artworkUrl(feature.channel);
  return (
    <div className={compact ? "tv-home-card-wrap is-compact" : "tv-home-card-wrap"}>
      <button
        type="button"
        data-tv-card
        {...(initialFocus ? { "data-tv-initial-focus": true } : {})}
        className="tv-home-card"
        onClick={onSelect}
        onFocus={onFocus}
        onMouseEnter={onFocus}
        aria-label={`${feature.source === "continue" ? "Resume" : "Open"} ${title}`}
      >
        <span
          className="tv-home-card-fallback"
          style={{ background: gradientFromChannelName(title) }}
          aria-hidden
        />
        {art ? <img src={art} alt="" loading="lazy" decoding="async" /> : null}
        <span className="tv-home-card-vignette" aria-hidden />
        <span className="tv-home-card-title">{title}</span>
        {progress != null ? (
          <span className="tv-home-card-progress" aria-hidden>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        ) : null}
      </button>
      {metadata ? <p className="tv-home-card-meta">{metadata}</p> : null}
    </div>
  );
}

function HomeRailSection({
  id,
  title,
  compact = false,
  children,
}: {
  id: string;
  title: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={compact ? "tv-home-section is-compact" : "tv-home-section"}>
      <h2>{title}</h2>
      <div className="tv-home-rail" data-tv-layout="horizontal">
        {children}
      </div>
    </section>
  );
}

export function TvHome() {
  const router = useRouter();
  const { onNavigateClick } = useRemoteNavigation();
  const { openChannel, playChannel, navError, clearNavError } = useWatchNavigation();
  const catalog = useCatalogMeta();
  const homeShelves = useHomeCatalogShelves({
    presetId: source.presetId,
    language: DEFAULT_RECOMMENDATION_LANGUAGE,
    discoverLimit: 36,
    movieLimit: 24,
    seriesLimit: 24,
  });
  const { channelCount, catalogLoaded, metaFailed, busy, refreshCatalog } = catalog;
  const [statsEpoch, setStatsEpoch] = useState(0);
  const [focusedFeature, setFocusedFeature] = useState<HomeFeature | null>(null);

  useEffect(() => subscribeViewingStats(() => setStatsEpoch((value) => value + 1)), []);

  useEffect(() => {
    if (!catalogLoaded || metaFailed) return;
    if ((channelCount ?? 0) === 0) router.replace("/setup");
  }, [catalogLoaded, channelCount, metaFailed, router]);

  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  const { items: continueWatching, loading: continueWatchingLoading } =
    useContinueWatchingState(18);

  const recentChannels = useMemo(() => {
    void statsEpoch;
    return dedupeChannels(
      listRecentPlayback(18).map((entry) =>
        viewingEntryToChannel(entry, [
          ...homeShelves.discover.channels,
          ...homeShelves.movies.channels,
          ...homeShelves.series.channels,
        ]),
      ),
    );
  }, [homeShelves.discover.channels, homeShelves.movies.channels, homeShelves.series.channels, statsEpoch]);

  const frequentChannels = useMemo(() => {
    void statsEpoch;
    const recentUrls = new Set(recentChannels.map((channel) => channel.url));
    return dedupeChannels(
      listTopByPlayCount(18)
        .map((entry) => viewingEntryToChannel(entry, recentChannels))
        .filter((channel) => !recentUrls.has(channel.url)),
    );
  }, [recentChannels, statsEpoch]);

  const continueUrls = useMemo(
    () => new Set(continueWatching.map((item) => item.channel.url)),
    [continueWatching],
  );

  const trendingChannels = useMemo(
    () =>
      interleaveChannels(homeShelves.series.channels, homeShelves.movies.channels)
        .filter((channel) => !continueUrls.has(channel.url))
        .slice(0, 18),
    [continueUrls, homeShelves.movies.channels, homeShelves.series.channels],
  );

  const popularChannels = useMemo(
    () =>
      dedupeChannels([
        ...frequentChannels,
        ...homeShelves.discover.channels,
        ...recentChannels,
      ])
        .filter((channel) => !continueUrls.has(channel.url))
        .slice(0, 24),
    [continueUrls, frequentChannels, homeShelves.discover.channels, recentChannels],
  );

  const movieChannels = useMemo(
    () => homeShelves.movies.channels.filter((channel) => !continueUrls.has(channel.url)).slice(0, 18),
    [continueUrls, homeShelves.movies.channels],
  );
  const seriesChannels = useMemo(
    () => homeShelves.series.channels.filter((channel) => !continueUrls.has(channel.url)).slice(0, 18),
    [continueUrls, homeShelves.series.channels],
  );

  const defaultFeature = useMemo<HomeFeature | null>(() => {
    if (continueWatching[0]) return featureFromContinue(continueWatching[0]);
    const firstCatalogItem = trendingChannels[0] ?? popularChannels[0] ?? movieChannels[0] ?? seriesChannels[0];
    return firstCatalogItem ? featureFromChannel(firstCatalogItem) : null;
  }, [continueWatching, movieChannels, popularChannels, seriesChannels, trendingChannels]);
  const heroFeature = focusedFeature ?? defaultFeature;
  const embeddedHeroMetadata = heroFeature?.channel.homeMetadata ?? null;
  const heroMetadataQuery = useMemo(() => {
    if (!heroFeature || heroFeature.channel.homeMetadata) return null;
    const contentType = resolveLibraryContentType(heroFeature.channel);
    const mediaType = heroFeature.playback?.contentKind === "episode" || contentType === "series"
      ? "tv" as const
      : heroFeature.playback?.contentKind === "movie" || contentType === "movie"
        ? "movie" as const
        : null;
    if (!mediaType) return null;
    return {
      title: displayTitle(heroFeature),
      mediaType,
      ...(heroFeature.channel.providerChannelId
        ? { channelId: heroFeature.channel.providerChannelId }
        : {}),
      ...(heroFeature.playback?.seriesId ? { seriesId: heroFeature.playback.seriesId } : {}),
      ...(heroFeature.playback?.imdbId ? { imdbId: heroFeature.playback.imdbId } : {}),
      ...(heroFeature.playback?.year ? { year: heroFeature.playback.year } : {}),
    };
  }, [heroFeature]);
  const fetchedHeroMetadata = useHomeHeroMetadata(heroMetadataQuery);
  const heroMetadata = embeddedHeroMetadata ?? fetchedHeroMetadata;

  const playFeature = (feature: HomeFeature | null) => {
    if (!feature) return;
    if (feature.source === "continue") {
      playChannel({
        ...feature.channel,
        ...(feature.playback ? { playback: feature.playback } : {}),
      });
      return;
    }
    openChannel(feature.channel);
  };

  const openFeatureInfo = (feature: HomeFeature | null) => {
    if (!feature) return;
    if (feature.playback?.seriesId) {
      router.push(buildShowPageHref(feature.playback.seriesId, feature.channel));
      return;
    }
    openChannel(feature.channel);
  };

  if (metaFailed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 pt-20 text-center text-foreground-intense">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Catalog offline</p>
        <p className="max-w-md text-[22px] font-semibold tracking-[-0.04em] text-foreground-intense">
          Could not reach the catalog server.
        </p>
        <Button type="button" disabled={busy} onClick={() => void refreshCatalog()}>
          {busy ? <><ZendeSpinner size="tiny" label="Retrying" /> Retrying…</> : "Retry"}
        </Button>
      </div>
    );
  }

  if ((channelCount ?? 0) === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background pt-20 text-foreground-intense">
        <p className="text-[15px] font-medium">Opening setup…</p>
      </div>
    );
  }

  return (
    <AppicaPage className="tv-home-page">
      <HomeHero
        feature={heroFeature}
        metadata={heroMetadata}
        onPrimary={() => playFeature(heroFeature)}
        onMoreInfo={() => openFeatureInfo(heroFeature)}
      />

      <div className="tv-home-shelves">
        {continueWatching.length > 0 ? (
          <HomeRailSection id="continue" title="Continue Watching">
            {continueWatching.map((item, index) => {
              const feature = featureFromContinue(item);
              return (
                <HomeMediaCard
                  key={`continue-${item.channel.url}-${index}`}
                  feature={feature}
                  progress={item.progress}
                  metadata={featureMeta(feature)}
                  initialFocus={index === 0}
                  onFocus={() => setFocusedFeature(feature)}
                  onSelect={() => playFeature(feature)}
                />
              );
            })}
          </HomeRailSection>
        ) : continueWatchingLoading ? (
          <section className="tv-home-section tv-home-loading" aria-label="Loading continue watching">
            <h2>Continue Watching</h2>
            <div className="tv-home-loading-cards" aria-hidden>
              {[0, 1, 2, 3, 4].map((item) => <span key={item} />)}
            </div>
          </section>
        ) : null}

        {trendingChannels.length > 0 ? (
          <HomeRailSection id="trending" title="Trending Now" compact>
            {trendingChannels.map((channel, index) => {
              const feature = featureFromChannel(channel);
              return (
                <HomeMediaCard
                  key={`trending-${channel.url}-${index}`}
                  feature={feature}
                  compact
                  initialFocus={continueWatching.length === 0 && index === 0}
                  onFocus={() => setFocusedFeature(feature)}
                  onSelect={() => openChannel(channel)}
                />
              );
            })}
          </HomeRailSection>
        ) : null}

        {popularChannels.length > 0 ? (
          <HomeRailSection id="popular" title="Popular on Zende" compact>
            {popularChannels.map((channel, index) => {
              const feature = featureFromChannel(channel);
              return (
                <HomeMediaCard
                  key={`popular-${channel.url}-${index}`}
                  feature={feature}
                  compact
                  initialFocus={continueWatching.length === 0 && trendingChannels.length === 0 && index === 0}
                  onFocus={() => setFocusedFeature(feature)}
                  onSelect={() => openChannel(channel)}
                />
              );
            })}
          </HomeRailSection>
        ) : null}

        {movieChannels.length > 0 ? (
          <HomeRailSection id="movies" title="Movies for You" compact>
            {movieChannels.map((channel, index) => {
              const feature = featureFromChannel(channel);
              return (
                <HomeMediaCard
                  key={`movie-${channel.url}-${index}`}
                  feature={feature}
                  compact
                  onFocus={() => setFocusedFeature(feature)}
                  onSelect={() => openChannel(channel)}
                />
              );
            })}
          </HomeRailSection>
        ) : null}

        {seriesChannels.length > 0 ? (
          <HomeRailSection id="series" title="Series to Explore" compact>
            {seriesChannels.map((channel, index) => {
              const feature = featureFromChannel(channel);
              return (
                <HomeMediaCard
                  key={`series-${channel.url}-${index}`}
                  feature={feature}
                  compact
                  onFocus={() => setFocusedFeature(feature)}
                  onSelect={() => openChannel(channel)}
                />
              );
            })}
          </HomeRailSection>
        ) : null}

        <section className="tv-home-library-cta">
          <div>
            <p>Keep exploring</p>
            <h2>Your complete catalog is waiting.</h2>
          </div>
          <div className="flex flex-wrap gap-3" data-tv-layout="horizontal">
            <Link
              href="/library"
              onClick={onNavigateClick("/library")}
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Open Library
            </Link>
            <Button type="button" size="lg" disabled={busy} onClick={() => void refreshCatalog()}>
              {busy ? <><ZendeSpinner size="tiny" label="Updating catalog" /> Updating…</> : "Refresh catalog"}
            </Button>
          </div>
        </section>
      </div>

      {homeShelves.error ? (
        <p className="tv-home-shelf-error">Some recommendations are temporarily unavailable.</p>
      ) : null}
      {navError ? <NavErrorBanner message={navError} onDismiss={clearNavError} /> : null}
    </AppicaPage>
  );
}
