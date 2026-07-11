"use client";

import { Loader2 } from "lucide-react";

import type { BuiltinPlaylistSource } from "@/config/builtin-playlist-sources";
import { ZendeGlass } from "@/components/glass/zende-glass";
import { TvContentRow } from "@/components/tv/tv-content-row";

type Props = {
  source: BuiltinPlaylistSource;
  busy: boolean;
  error: string | null;
  registered: boolean;
  channelCount: number | null;
  /** Streams added under Settings → Your streams (included in channelCount). */
  manualChannelCount?: number;
  onRefresh: () => void;
};

export function TvCatalogSetupStrip({
  source,
  busy,
  error,
  registered,
  channelCount,
  manualChannelCount = 0,
  onRefresh,
}: Props) {
  return (
    <TvContentRow
      id="sources"
      bleed
      edgeFade={false}
      title="Channel catalog"
      description="Caches the public world index on this device. Add your own streams anytime in Settings, or refresh the index here."
    >
      <div className="min-w-full shrink-0 snap-start">
        <ZendeGlass variant="panel" className="shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)]">
          <div className="flex flex-col gap-5 px-8 py-7 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-[17px] font-semibold tracking-tight text-white">
                {source.label}
              </p>
              <p className="max-w-[560px] text-[15px] leading-relaxed text-white/48">
                Downloads and caches channel names, groups, and stream links locally
                so browsing stays fast — even on slower connections.
              </p>
              {channelCount != null ? (
                <p className="text-[14px] font-medium text-emerald-400/90">
                  {channelCount.toLocaleString()} channels on this device
                  {manualChannelCount > 0
                    ? ` (${manualChannelCount.toLocaleString()} added by you)`
                    : ""}
                  .
                </p>
              ) : null}
              {error ? (
                <p className="text-[14px] font-medium text-red-400/95" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onRefresh}
              aria-busy={busy}
              className="group shrink-0 self-start border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tv-page-bg)] disabled:pointer-events-none disabled:opacity-45"
            >
              <ZendeGlass
                variant="heroSecondary"
                className="inline-flex transition-transform duration-200 group-hover:scale-[1.02] group-active:scale-[0.98]"
              >
                <span className="inline-flex h-11 min-w-[132px] items-center justify-center gap-2 px-7 text-[15px] font-semibold text-white">
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Updating…
                    </>
                  ) : registered ? (
                    "Refresh catalog"
                  ) : (
                    "Add catalog"
                  )}
                </span>
              </ZendeGlass>
            </button>
          </div>
        </ZendeGlass>
      </div>
    </TvContentRow>
  );
}
