"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { Card } from "@appica/ui-react/card";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { cn } from "@/lib/utils";
import { TV_BROWSE_TOP_PAD_CLASS } from "@/components/tv/tv-top-bar";
import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";

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
    <div className="bg-background min-h-screen text-foreground">
      <main
        className={cn(
          "flex min-h-screen flex-col pb-24",
          TV_BROWSE_TOP_PAD_CLASS,
        )}
      >
        <div className={cn(BROWSE_CONTAINER_CLASS, "flex flex-1 flex-col justify-center")}>
          <div className="mb-7 text-center motion-reduce:animate-none motion-reduce:opacity-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Welcome
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground-intense mt-3">
              Set up Zende
            </h1>
            <p className="text-sm text-foreground-muted mx-auto mt-3 max-w-md sm:text-[16px]">
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
              <Card frame="solid" className="inline-block">
                <span className="flex min-h-[44px] min-w-[160px] items-center justify-center px-6 text-[16px] font-semibold text-foreground-intense">
                  Advanced options
                </span>
              </Card>
            </Link>
            <p className="max-w-sm text-center text-[14px] leading-relaxed text-foreground-intense">
              Catalog updates and stream health tools live in Settings whenever you
              need them.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-10 text-center">
        <p className="text-[13px] leading-relaxed text-foreground-intense">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
    </div>
  );
}
