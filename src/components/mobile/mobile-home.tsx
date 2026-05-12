"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import {
  listRecentPlayback,
  listTopByPlayCount,
  subscribeViewingStats,
  viewingEntryToChannel,
} from "@/lib/watch/viewing-stats";

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
    <section id={id} className="scroll-mt-24" aria-label={title}>
      <div className="px-4">
        <h2 className="text-[22px] font-semibold tracking-tight text-white">
          {title}
        </h2>
        <p className="mt-1 max-w-[30ch] text-[14px] leading-snug text-white/45">
          {description}
        </p>
      </div>
      <div className="tv-row-scroll mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {channels.map((channel, index) => (
          <MobileChannelCard
            key={`${title}-${channel.url}-${index}`}
            channel={channel}
            healthScore={getScoreForChannel(channel)}
            onSelect={onSelect}
            className="w-[78vw] max-w-[320px] shrink-0 snap-start"
          />
        ))}
      </div>
    </section>
  );
}

export function MobileHome() {
  const router = useRouter();
  const { openChannel, navError, clearNavError } = useWatchNavigation();
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
    if (channels.length === 0) router.replace("/setup");
  }, [catalogLoaded, channels.length, router]);

  const recentChannels = useMemo(() => {
    void statsEpoch;
    return dedupeChannels(
      listRecentPlayback(12).map((entry) => viewingEntryToChannel(entry, channels)),
    );
  }, [channels, statsEpoch]);

  const frequentChannels = useMemo(() => {
    void statsEpoch;
    const recentUrls = new Set(recentChannels.map((channel) => channel.url));
    return dedupeChannels(
      listTopByPlayCount(12)
        .map((entry) => viewingEntryToChannel(entry, channels))
        .filter((channel) => !recentUrls.has(channel.url)),
    );
  }, [channels, recentChannels, statsEpoch]);

  const discoverSlice = useMemo(() => {
    const skip = new Set([
      ...recentChannels.map((channel) => channel.url),
      ...frequentChannels.map((channel) => channel.url),
    ]);
    const picked: M3uChannel[] = [];
    for (const channel of channels) {
      if (picked.length >= 18) break;
      if (!skip.has(channel.url)) picked.push(channel);
    }
    if (picked.length < 8) {
      for (const channel of channels) {
        if (picked.length >= 18) break;
        if (!picked.some((item) => item.url === channel.url)) picked.push(channel);
      }
    }
    return picked;
  }, [channels, frequentChannels, recentChannels]);

  const featured = useMemo(() => {
    void statsEpoch;
    const recentFirst = listRecentPlayback(1)[0];
    if (recentFirst) return viewingEntryToChannel(recentFirst, channels);
    const top = listTopByPlayCount(1)[0];
    if (top) return viewingEntryToChannel(top, channels);
    return channels.find((channel) => channel.tvgLogo) ?? channels[0];
  }, [channels, statsEpoch]);

  if (!catalogLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tv-page-bg)] px-4 text-white/45">
        <p className="text-[15px] font-medium">Loading…</p>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tv-page-bg)] px-4 text-white/45">
        <p className="text-[15px] font-medium">Opening setup…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[6.25rem] text-foreground">
      <section className="px-4">
        <ZenedeGlass
          variant="panel"
          className="relative overflow-hidden rounded-[32px] border-white/[0.1] bg-white/[0.055] px-5 pb-5 pt-7"
        >
          <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
            <div className="absolute inset-x-[-20%] top-[-45%] h-[72%] rounded-full bg-[radial-gradient(circle,oklch(0.44_0.14_264/0.48),transparent_62%)] blur-2xl" />
            {featured?.tvgLogo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featured.tvgLogo}
                  alt=""
                  className="absolute right-4 top-5 max-h-20 max-w-24 object-contain opacity-20 blur-[1px]"
                  loading="lazy"
                />
              </>
            ) : null}
          </div>

          <div className="relative z-10">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
              Zenede
            </p>
            <h1 className="mt-2 max-w-[11ch] text-[34px] font-semibold leading-[0.98] tracking-tight text-white">
              Live TV, built for touch.
            </h1>
            <p className="mt-4 max-w-[29ch] text-[15px] leading-relaxed text-white/55">
              Jump back in, search fast, or browse a fresh slice of your catalog
              without leaving one-handed reach.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy || !featured}
                onClick={() => featured && openChannel(featured)}
                className="min-h-[52px] rounded-2xl bg-white px-4 text-[15px] font-semibold text-zinc-950 outline-none transition-transform active:scale-[0.98] disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-white"
              >
                Play
              </button>
              <Link
                href="/library"
                className="flex min-h-[52px] items-center justify-center rounded-2xl border border-white/[0.14] bg-white/[0.08] px-4 text-[15px] font-semibold text-white outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white"
              >
                Library
              </Link>
            </div>
          </div>
        </ZenedeGlass>
      </section>

      <div className="mt-8 space-y-9">
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
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/library"
                className="flex min-h-[50px] items-center justify-center rounded-2xl bg-white text-[14px] font-semibold text-zinc-950"
              >
                Open Library
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCatalog()}
                className="flex min-h-[50px] items-center justify-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.06] text-[14px] font-semibold text-white disabled:opacity-45"
              >
                <RefreshCw className="size-4" aria-hidden />
                {busy ? "Updating" : "Refresh"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </main>
  );
}
