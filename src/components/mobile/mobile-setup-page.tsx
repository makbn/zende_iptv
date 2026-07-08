"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { cn } from "@/lib/utils";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

export function MobileSetupPage() {
  const router = useRouter();
  const { onNavigateClick } = useRemoteNavigation();
  const {
    busy,
    error,
    channelCount,
    manualChannelCount,
    registered,
    catalogLoaded,
    refreshCatalog,
  } = useCatalogBootstrap(source);

  useEffect(() => {
    if (!catalogLoaded) return;
    if ((channelCount ?? 0) > 0) router.replace("/");
  }, [catalogLoaded, channelCount, router]);

  return (
    <main className="zen-page-bg min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-[24px] border border-white/[0.11] bg-white/[0.055] p-4 ring-1 ring-white/[0.05]",
            "backdrop-blur-xl motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_40%_-20%,rgba(56,217,255,0.22),transparent_55%)]" />
          <div className="relative">
            <p className="zen-kicker text-[10px]">
              Welcome
            </p>
            <h1 className="mt-1 text-[clamp(1.55rem,5.8vw,1.9rem)] font-semibold leading-tight tracking-[-0.055em] text-white">
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

        <div className="zen-card rounded-[26px] p-5">
          <Link
            href="/settings"
            onClick={onNavigateClick("/settings")}
            className="flex min-h-[52px] items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[15px] font-semibold text-white"
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
