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
    <main className="bg-background min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-lg border border-border bg-background-muted p-4 ring-1 ring-border",
            "backdrop-blur-xl motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-background-subtle" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted text-[10px]">
              Welcome
            </p>
            <h1 className="mt-1 text-[clamp(1.55rem,5.8vw,1.9rem)] font-semibold leading-tight tracking-[-0.055em] text-foreground-intense">
              Set up Zende
            </h1>
            <p className="mt-2 text-[13px] leading-snug text-foreground-intense">
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

        <div className="border border-border bg-background-subtle shadow-sm rounded-lg p-5">
          <Link
            href="/settings"
            onClick={onNavigateClick("/settings")}
            className="flex min-h-[52px] items-center justify-center rounded-full border border-border bg-background-muted text-[15px] font-semibold text-foreground-intense"
          >
            Advanced options
          </Link>
          <p className="mt-4 text-center text-[13px] leading-relaxed text-foreground-intense">
            Catalog updates and stream health tools are always available in
            Settings.
          </p>
        </div>
      </div>
    </main>
  );
}
