"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { cn } from "@/lib/utils";
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
    <section
      id={id}
      className="scroll-mt-24 motion-safe:animate-zen-row-lift motion-reduce:animate-none motion-reduce:opacity-100"
      aria-label={title}
    >
      <div className="px-4">
        <h2 className="text-[19px] font-semibold tracking-tight text-white">
          {title}
        </h2>
        <p className="mt-0.5 max-w-[34ch] text-[13px] leading-snug text-white/44">
          {description}
        </p>
      </div>
      <div className="tv-row-scroll zen-stagger-row mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2 sm:gap-3">
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
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.038] px-3.5 py-3 ring-1 ring-white/[0.04]",
            "backdrop-blur-md transition-[border-color,box-shadow] duration-300 ease-out",
            "hover:border-white/[0.12] hover:shadow-[0_20px_50px_-32px_rgba(0,0,0,0.65)]",
            "motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <div className="pointer-events-none absolute inset-0 opacity-55" aria-hidden>
            <div className="absolute inset-x-[-18%] top-[-48%] h-[68%] rounded-full bg-[radial-gradient(circle,oklch(0.44_0.14_264/0.38),transparent_62%)] blur-2xl" />
            {featured?.tvgLogo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featured.tvgLogo}
                  alt=""
                  className="absolute right-2 top-3 max-h-14 max-w-[4.5rem] object-contain opacity-[0.18] blur-[0.5px]"
                  loading="lazy"
                />
              </>
            ) : null}
          </div>

          <div className="relative z-10">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Zenede
                </p>
                <h1 className="mt-0.5 max-w-[16ch] text-[clamp(1.45rem,6.2vw,1.75rem)] font-semibold leading-[1.08] tracking-tight text-white">
                  Live TV, built for touch.
                </h1>
              </div>
              {channelCount != null ? (
                <span className="shrink-0 rounded-lg border border-white/[0.08] bg-black/35 px-2 py-1 text-[10px] leading-none text-white/50 ring-1 ring-white/[0.03]">
                  <span className="font-semibold tabular-nums text-white/88">
                    {channelCount.toLocaleString()}
                  </span>{" "}
                  channels
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-[36ch] text-[13px] leading-snug text-white/48">
              Rows below update from your watch history — Library has search and filters.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy || !featured}
                onClick={() => featured && openChannel(featured)}
                className="zen-pressable min-h-[46px] rounded-xl bg-white px-3 text-[14px] font-semibold text-zinc-950 outline-none transition-shadow hover:shadow-md hover:shadow-black/25 disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-white"
              >
                Play
              </button>
              <Link
                href="/library"
                className="zen-pressable flex min-h-[46px] items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.07] px-3 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-white/[0.11] focus-visible:ring-2 focus-visible:ring-white"
              >
                Library
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 space-y-8">
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
                className="zen-pressable flex min-h-[46px] items-center justify-center rounded-xl bg-white text-[14px] font-semibold text-zinc-950 outline-none transition-shadow hover:shadow-md hover:shadow-black/20 focus-visible:ring-2 focus-visible:ring-white"
              >
                Open Library
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshCatalog()}
                className="zen-pressable flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.06] text-[14px] font-semibold text-white outline-none transition-colors hover:bg-white/[0.1] disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-white"
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
