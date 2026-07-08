"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import { TvContentRow } from "@/components/tv/tv-content-row";
import { TvHeroFeature } from "@/components/tv/tv-hero-feature";
import { ZenedeLogoWave } from "@/components/loading/zenede-logo-wave";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useLibraryCatalog } from "@/features/iptv/use-library-catalog";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
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
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const catalog = useCatalogBootstrap(source);

  const discoverCatalog = useLibraryCatalog({
    presetId: source.presetId,
    contentTab: "all",
    query: "",
    groupFilter: null,
    languageFilter: null,
    offset: 0,
    pageSize: 36,
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
    const discover = discoverCatalog.channels.filter((c) => !skip.has(c.url));
    return dedupeChannels([...recent, ...frequent, ...discover]);
  }, [statsEpoch, discoverCatalog.channels]);

  const { getScoreForChannel } = useChannelHealthLookup(shelfChannels);

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
        eyebrow: "Zenede",
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
      subtitle:
        "Jump back in, browse what you watch often, or explore something new — tuned for quick picks on the couch.",
      backdropUrl: featured.tvgLogo ?? null,
      primaryLabel: "Play",
      secondaryLabel: "Library",
    };
  }, [featured]);

  function handlePrimary() {
    if (busy) return;
    if (!featured) {
      router.push("/library");
      return;
    }
    openChannel(featured);
  }

  function handleSecondary() {
    if (!featured) {
      router.push("/settings");
      return;
    }
    router.push("/library");
  }

  const discoverSlice = useMemo(() => {
    const skip = new Set<string>([
      ...recentChannels.map((c) => c.url),
      ...frequentChannels.map((c) => c.url),
    ]);
    return discoverCatalog.channels
      .filter((c) => !skip.has(c.url))
      .slice(0, 36);
  }, [discoverCatalog.channels, recentChannels, frequentChannels]);

  if (!catalogLoaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--tv-page-bg)] pt-20 text-white/45">
        <ZenedeLogoWave size="md" />
        <p className="sr-only">Loading</p>
      </div>
    );
  }

  if (metaFailed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--tv-page-bg)] px-6 pt-20 text-center text-white/55">
        <p className="text-[15px] font-medium">Could not reach the catalog server.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refreshCatalog()}
          className="rounded-xl bg-white px-5 py-2.5 text-[15px] font-semibold text-zinc-950 disabled:opacity-45"
        >
          {busy ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if ((channelCount ?? 0) === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tv-page-bg)] pt-20 text-white/45">
        <p className="text-[15px] font-medium">Opening setup…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--tv-page-bg)] text-foreground">
      <TvHeroFeature
        eyebrow={hero.eyebrow}
        title={hero.title}
        subtitle={hero.subtitle}
        backdropUrl={hero.backdropUrl}
        primaryLabel={hero.primaryLabel}
        secondaryLabel={hero.secondaryLabel}
        onPrimary={handlePrimary}
        onSecondary={handleSecondary}
        primaryDisabled={busy}
        secondaryDisabled={busy}
      />

      <div className="relative z-10 -mt-16 space-y-11 pb-10 sm:-mt-20 sm:space-y-14 sm:pb-14 lg:-mt-24">
        {recentChannels.length > 0 ? (
          <TvContentRow
            id="recent"
            title="Recently Watched"
            description="Pick up from channels you opened last — on this device."
          >
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
          </TvContentRow>
        ) : (
          <TvContentRow
            id="recent"
            title="Recently Watched"
            description="Channels you play will appear here for one-tap return visits."
          >
            <div className="flex w-[min(100vw-3rem,420px)] shrink-0 snap-start flex-col justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-7 py-10 ring-1 ring-white/[0.04]">
              <p className="text-[17px] font-semibold text-white">Nothing here yet</p>
              <p className="mt-2 text-[15px] leading-relaxed text-white/48">
                Start something from{" "}
                <Link
                  href="/library"
                  className="font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  Library
                </Link>{" "}
                or press Play above — your lineup builds automatically.
              </p>
            </div>
          </TvContentRow>
        )}

        {frequentChannels.length > 0 ? (
          <TvContentRow
            id="frequent"
            title="Because You Watch"
            description="Channels you come back to often."
          >
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
          </TvContentRow>
        ) : null}

        <TvContentRow
          id="live"
          title="Discover"
          description={
            channelCount != null
              ? `${channelCount.toLocaleString()} channels in your catalog — a fresh slice below.`
              : "Explore live channels from your catalog."
          }
        >
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
        </TvContentRow>

        <div className="px-6 sm:px-10 lg:px-14 xl:px-20">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="text-[15px] leading-relaxed text-white/55">
              <span className="font-medium text-white/80">Library</span> has search,
              full lists, and reliability badges for every stream.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/library" className="group inline-flex shrink-0 outline-none">
                <ZenedeGlass
                  variant="ctaPill"
                  className="transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.98]"
                >
                  <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                    Open Library
                  </span>
                </ZenedeGlass>
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCatalog()}
                className="group inline-flex shrink-0 border-0 bg-transparent p-0 outline-none disabled:opacity-40"
              >
                <ZenedeGlass variant="heroSecondary" className="inline-block">
                  <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-white">
                    {busy ? "Updating…" : "Refresh catalog"}
                  </span>
                </ZenedeGlass>
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-white/[0.06] py-10 text-center">
        <p className="text-[13px] leading-relaxed text-white/35">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </div>
  );
}
