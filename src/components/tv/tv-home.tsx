"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import { TvContentRow } from "@/components/tv/tv-content-row";
import { TvHeroFeature } from "@/components/tv/tv-hero-feature";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { watchHref } from "@/lib/navigation/watch-url";
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
  const catalog = useCatalogBootstrap(source);

  const {
    channels,
    busy,
    channelCount,
    refreshCatalog,
    catalogLoaded,
  } = catalog;

  const { getScoreForChannel } = useChannelHealthLookup(channels);

  const [statsEpoch, setStatsEpoch] = useState(0);

  useEffect(() => subscribeViewingStats(() => setStatsEpoch((n) => n + 1)), []);

  useEffect(() => {
    if (!catalogLoaded) return;
    if (channels.length === 0) {
      router.replace("/setup");
    }
  }, [catalogLoaded, channels.length, router]);

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
    const mapped = entries.map((e) => viewingEntryToChannel(e, channels));
    return dedupeChannels(mapped);
  }, [channels, statsEpoch]);

  const frequentChannels = useMemo(() => {
    void statsEpoch;
    const entries = listTopByPlayCount(18);
    const mapped = entries.map((e) => viewingEntryToChannel(e, channels));
    const recentUrls = new Set(recentChannels.map((c) => c.url));
    return dedupeChannels(mapped.filter((c) => !recentUrls.has(c.url)));
  }, [channels, statsEpoch, recentChannels]);

  const featured = useMemo(() => {
    void statsEpoch;
    const recentFirst = listRecentPlayback(1)[0];
    if (recentFirst) {
      return viewingEntryToChannel(recentFirst, channels);
    }
    const top = listTopByPlayCount(1)[0];
    if (top) {
      return viewingEntryToChannel(top, channels);
    }
    const withLogo = channels.find((c) => c.tvgLogo);
    return withLogo ?? channels[0];
  }, [channels, statsEpoch]);

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
    router.push(watchHref(featured));
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
    const picked: typeof channels = [];
    for (const c of channels) {
      if (picked.length >= 36) break;
      if (!skip.has(c.url)) picked.push(c);
    }
    if (picked.length < 12) {
      for (const c of channels) {
        if (picked.length >= 36) break;
        if (!picked.some((p) => p.url === c.url)) picked.push(c);
      }
    }
    return picked;
  }, [channels, recentChannels, frequentChannels]);

  if (!catalogLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tv-page-bg)] pt-20 text-white/45">
        <p className="text-[15px] font-medium">Loading…</p>
      </div>
    );
  }

  if (channels.length === 0) {
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

      <div className="relative z-10 -mt-24 space-y-14 pb-12 sm:-mt-28 sm:space-y-16 sm:pb-16 lg:-mt-32">
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
                  router.push(watchHref(c));
                }}
                contextMenu={{
                  onPlay: () => {
                    log.debug("Play from recent menu", { name: ch.name });
                    router.push(watchHref(ch));
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
                  router.push(watchHref(c));
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
                router.push(watchHref(c));
              }}
            />
          ))}
        </TvContentRow>

        <div className="mx-auto max-w-[1920px] px-6 sm:px-10 lg:px-14 xl:px-20">
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
    </div>
  );
}
