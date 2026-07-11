"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { ZendeGlass } from "@/components/glass/zende-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { cn } from "@/lib/utils";
import { TV_BROWSE_TOP_PAD_CLASS } from "@/components/tv/tv-top-bar";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

/**
 * First-run flow only. Once a catalog exists locally, users are sent to Home.
 */
export function TvSetupPage() {
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
    if ((channelCount ?? 0) > 0) {
      router.replace("/");
    }
  }, [catalogLoaded, channelCount, router]);

  return (
    <div className="zen-page-bg min-h-screen text-foreground">
      <main
        className={cn(
          "flex min-h-screen flex-col pb-24",
          TV_BROWSE_TOP_PAD_CLASS,
        )}
      >
        <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col justify-center px-6 sm:px-10 lg:px-14 xl:px-20">
          <div className="mb-7 text-center motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100">
            <p className="zen-kicker">
              Welcome
            </p>
            <h1 className="zen-page-title mt-3">
              Set up Zende
            </h1>
            <p className="zen-body-muted mx-auto mt-3 max-w-md sm:text-[16px]">
              Add the built-in channel index once. Home then shows recents and picks — tuned for the big screen.
            </p>
          </div>

          <TvCatalogSetupStrip
            source={source}
            busy={busy}
            error={error}
            registered={registered}
            channelCount={channelCount}
            manualChannelCount={manualChannelCount}
            onRefresh={() => void refreshCatalog()}
          />

          <div className="mt-10 flex flex-col items-center gap-4">
            <Link
              href="/settings"
              onClick={onNavigateClick("/settings")}
              className="outline-none"
            >
              <ZendeGlass variant="heroSecondary" className="inline-block">
                <span className="flex min-h-[44px] min-w-[160px] items-center justify-center px-6 text-[16px] font-semibold text-white">
                  Advanced options
                </span>
              </ZendeGlass>
            </Link>
            <p className="max-w-sm text-center text-[14px] leading-relaxed text-white/40">
              Catalog updates and stream health tools live in Settings whenever you
              need them.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-10 text-center">
        <p className="text-[13px] leading-relaxed text-white/35">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
    </div>
  );
}
