"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { cn } from "@/lib/utils";
import { TV_BROWSE_TOP_PAD_CLASS } from "@/components/tv/tv-top-bar";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

/**
 * First-run flow only. Once a catalog exists locally, users are sent to Home.
 */
export function TvSetupPage() {
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
    if (channels.length > 0) {
      router.replace("/");
    }
  }, [catalogLoaded, channels.length, router]);

  return (
    <div className="min-h-screen bg-[var(--tv-page-bg)] text-foreground">
      <main
        className={cn(
          "flex min-h-screen flex-col pb-24",
          TV_BROWSE_TOP_PAD_CLASS,
        )}
      >
        <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col justify-center px-6 sm:px-10 lg:px-14 xl:px-20">
          <div className="mb-10 text-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Welcome
            </p>
            <h1 className="mt-3 text-[clamp(1.85rem,5vw,2.75rem)] font-semibold tracking-tight text-white">
              Set up Zenede
            </h1>
            <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-white/55">
              Add the built-in channel index once. After that, Home shows your
              recent channels and picks up right where you left off — just like on
              Apple&nbsp;TV.
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
            <Link href="/settings" className="outline-none">
              <ZenedeGlass variant="heroSecondary" className="inline-block">
                <span className="flex min-h-[44px] min-w-[160px] items-center justify-center px-6 text-[16px] font-semibold text-white">
                  Advanced options
                </span>
              </ZenedeGlass>
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
