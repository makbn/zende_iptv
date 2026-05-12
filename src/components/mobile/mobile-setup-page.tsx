"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";

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
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[6.25rem] text-foreground">
      <section className="px-4">
        <ZenedeGlass
          variant="panel"
          className="relative overflow-hidden rounded-[34px] border-white/[0.1] bg-white/[0.055] p-6"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,oklch(0.44_0.14_264/0.42),transparent_58%)]" />
          <div className="relative">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
              Welcome
            </p>
            <h1 className="mt-3 text-[36px] font-semibold leading-[0.98] tracking-tight text-white">
              Set up Zenede
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-white/52">
              Add the built-in channel index once. After that, Home fills with
              recent channels and quick picks.
            </p>
          </div>
        </ZenedeGlass>
      </section>

      <div className="mt-6 space-y-6 px-4">
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
