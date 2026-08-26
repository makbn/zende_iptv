"use client";

import { Button } from "@appica/ui-react/button";

import type { BuiltinPlaylistSource } from "@/config/builtin-playlist-sources";
import { Card } from "@appica/ui-react/card";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
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
        <Card frame="glass" className="shadow-lg">
          <div className="flex flex-col gap-5 px-8 py-7 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-[17px] font-semibold tracking-tight text-foreground-intense">
                {source.label}
              </p>
              <p className="max-w-[560px] text-[15px] leading-relaxed text-foreground-intense">
                Downloads and caches channel names, groups, and stream links locally
                so browsing stays fast — even on slower connections.
              </p>
              {channelCount != null ? (
                <p className="text-[14px] font-medium text-success-strong">
                  {channelCount.toLocaleString()} channels on this device
                  {manualChannelCount > 0
                    ? ` (${manualChannelCount.toLocaleString()} added by you)`
                    : ""}
                  .
                </p>
              ) : null}
              {error ? (
                <p className="text-[14px] font-medium text-error-strong" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <Button variant="secondary"
              size="lg"
              type="button"
              disabled={busy}
              onClick={onRefresh}
              aria-busy={busy}
              className="shrink-0 self-start"
            >
              {busy ? (
                <><ZendeSpinner size="tiny" label="Updating catalog" /> Updating…</>
              ) : registered ? "Refresh catalog" : "Add catalog"}
            </Button>
          </div>
        </Card>
      </div>
    </TvContentRow>
  );
}
