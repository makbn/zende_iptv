"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { cn } from "@/lib/utils";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

export function MobileSetupPage() {
  const router = useRouter();
  const {
    busy,
    error,
    channelCount,
    manualChannelCount,
    registered,
    channels,
    catalogLoaded,
    refreshCatalog,
  } = useCatalogBootstrap(source);

  useEffect(() => {
    if (!catalogLoaded) return;
    if (channels.length > 0) router.replace("/");
  }, [catalogLoaded, channels.length, router]);

  return (
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4 ring-1 ring-white/[0.04]",
            "motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_40%_-20%,oklch(0.42_0.14_264/0.28),transparent_55%)]" />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Welcome
            </p>
            <h1 className="mt-1 text-[clamp(1.4rem,5.5vw,1.65rem)] font-semibold leading-tight tracking-tight text-white">
              Set up Zenede
            </h1>
            <p className="mt-2 text-[13px] leading-snug text-white/48">
              Add the built-in index once — Home fills with recents and picks right after.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 space-y-5 px-4">
        <TvCatalogSetupStrip
          source={source}
          busy={busy}
          error={error}
          registered={registered}
          channelCount={channelCount}
          manualChannelCount={manualChannelCount}
          onRefresh={() => void refreshCatalog()}
        />

        <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.04] p-5">
          <Link
            href="/settings"
            className="flex min-h-[52px] items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.06] text-[15px] font-semibold text-white"
          >
            Advanced options
          </Link>
          <p className="mt-4 text-center text-[13px] leading-relaxed text-white/38">
            Catalog updates and stream health tools are always available in
            Settings.
          </p>
        </div>
      </div>
    </main>
  );
}
