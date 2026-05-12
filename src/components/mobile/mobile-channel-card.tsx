"use client";

import { Play } from "lucide-react";

import { ChannelHealthBadge } from "@/components/health/channel-health-badge";
import { ChannelResolutionBadge } from "@/components/tv/channel-resolution-badge";
import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import type { HealthScoreDto } from "@/features/health/use-channel-health";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { cn } from "@/lib/utils";

type Props = {
  channel: M3uChannel;
  healthScore?: HealthScoreDto;
  onSelect: (channel: M3uChannel) => void;
  className?: string;
  compact?: boolean;
  showFavoriteStar?: boolean;
};

function gradientFromName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h + name.charCodeAt(i) * (i + 1)) % 360;
  }
  return `linear-gradient(145deg, oklch(0.34 0.12 ${h}) 0%, oklch(0.15 0.06 ${(h + 46) % 360}) 100%)`;
}

function metaLine(groupTitle?: string): string | null {
  const raw = groupTitle?.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "undefined" || lower === "unknown" || lower === "n/a" || lower === "na") {
    return null;
  }
  return raw;
}

export function MobileChannelCard({
  channel,
  healthScore,
  onSelect,
  className,
  compact = false,
  showFavoriteStar = true,
}: Props) {
  const { displayName, resolutionLabel } = parseChannelLabel(
    channel.name?.trim() || "Untitled",
  );
  const meta = metaLine(channel.groupTitle);

  return (
    <article className={cn("relative min-w-0", className)}>
      <button
        type="button"
        onClick={() => onSelect(channel)}
        className={cn(
          "group relative w-full overflow-hidden rounded-[24px] text-left outline-none",
          "border border-white/[0.09] bg-white/[0.045] ring-1 ring-white/[0.04]",
          "shadow-[0_16px_44px_-24px_rgba(0,0,0,0.9)] transition-transform active:scale-[0.985]",
          "focus-visible:ring-2 focus-visible:ring-white",
          compact ? "min-h-[92px]" : "min-h-[164px]",
        )}
        aria-label={`Play ${displayName}`}
      >
        <div
          className={cn(
            "absolute inset-0",
            compact ? "w-[118px]" : "h-full",
          )}
          style={!channel.tvgLogo ? { background: gradientFromName(displayName) } : undefined}
          aria-hidden
        >
          {channel.tvgLogo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={channel.tvgLogo}
                alt=""
                className={cn(
                  "absolute object-contain opacity-[0.96]",
                  compact
                    ? "inset-3 right-auto max-h-[68px] max-w-[82px]"
                    : "inset-0 m-auto max-h-[54%] max-w-[62%]",
                )}
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/76 via-black/22 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/10 to-transparent" />
          )}
        </div>

        <div
          className={cn(
            "relative z-10 flex h-full min-h-[inherit] flex-col justify-end p-4",
            compact && "ml-[112px] min-h-[92px] justify-center py-3 pl-3",
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <ChannelHealthBadge score={healthScore} />
            {resolutionLabel ? <ChannelResolutionBadge label={resolutionLabel} /> : null}
          </div>
          <p className="line-clamp-2 text-[16px] font-semibold leading-tight text-white">
            {displayName}
          </p>
          {meta ? (
            <p className="mt-1 truncate text-[13px] font-medium text-white/48">
              {meta}
            </p>
          ) : null}
        </div>

        <span className="absolute bottom-3 right-3 z-20 flex size-10 items-center justify-center rounded-full bg-white/[0.12] text-white/88 ring-1 ring-white/[0.08]">
          <Play className="ml-0.5 size-4 fill-current" aria-hidden />
        </span>
      </button>

      {showFavoriteStar ? (
        <div className="absolute right-3 top-3 z-30">
          <FavoriteStarButton channel={channel} />
        </div>
      ) : null}
    </article>
  );
}
