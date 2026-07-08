"use client";

import { Play, Tv } from "lucide-react";

import { ChannelHealthBadge } from "@/components/health/channel-health-badge";
import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import {
  ChannelArtBadge,
  ChannelLogo,
  gradientFromChannelName,
  sanitizeGroupTitle,
} from "@/components/channels/channel-presentation";
import type { HealthScoreDto } from "@/features/health/use-channel-health";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { cn } from "@/lib/utils";

type Props = {
  channel: M3uChannel;
  healthScore?: HealthScoreDto;
  onSelect: (channel: M3uChannel) => void;
  onPreview?: (channel: M3uChannel) => void;
  fastMode?: boolean;
  className?: string;
  compact?: boolean;
  showFavoriteStar?: boolean;
};

function gradientFromName(name: string) {
  return gradientFromChannelName(name);
}

function metaLine(groupTitle?: string): string | null {
  return sanitizeGroupTitle(groupTitle);
}

export function MobileChannelCard({
  channel,
  healthScore,
  onSelect,
  onPreview,
  fastMode = true,
  className,
  compact = false,
  showFavoriteStar = true,
}: Props) {
  const parsed = parseChannelLabel(channel.name?.trim() || "Untitled");
  const { displayName } = parsed;
  const meta = metaLine(channel.groupTitle);
  const contentType = resolveLibraryContentType(channel);

  return (
    <article className={cn("relative min-w-0", className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(channel)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(channel);
          }
        }}
        className={cn(
          "group relative w-full overflow-hidden rounded-[22px] text-left outline-none sm:rounded-[26px]",
          "border border-white/[0.11] bg-white/[0.055] ring-1 ring-white/[0.05]",
          fastMode
            ? "shadow-[0_12px_32px_-20px_rgba(0,0,0,0.8)] transition-[background-color,border-color] duration-150"
            : "shadow-[0_20px_54px_-28px_rgba(0,0,0,0.94)] transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          !fastMode && "active:scale-[0.985] motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tv-page-bg)]",
          fastMode
            ? "hover:border-white/[0.14] hover:bg-white/[0.055]"
            : "motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-white/[0.14] motion-safe:hover:bg-white/[0.055] motion-safe:hover:shadow-[0_22px_50px_-22px_rgba(0,0,0,0.92)]",
          compact ? "min-h-[92px]" : "aspect-[2/3]",
        )}
        aria-label={`Play ${displayName}`}
      >
        <div
          className={cn(
            "absolute inset-0",
            compact ? "w-[118px]" : "h-full",
          )}
          aria-hidden
        >
          {channel.tvgLogo ? (
            <>
              <ChannelLogo
                name={displayName}
                logoUrl={channel.tvgLogo}
                className={cn(
                  "absolute inset-0 rounded-none",
                  compact && "right-auto w-[118px]",
                )}
                fit={compact ? "contain" : "cover"}
                aspect="fill"
              />
              <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/82 via-black/34 to-transparent" />
            </>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{ background: gradientFromName(displayName) }}
              />
              <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/76 via-black/26 to-transparent" />
            </>
          )}
        </div>
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_0_38%,rgba(255,255,255,0.1)_48%,transparent_60%)] opacity-0 transition-opacity duration-300 group-active:opacity-100 group-hover:opacity-100"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-3 left-2.5 w-0.5 rounded-full bg-[var(--zen-signal)]/0 transition-colors duration-300 group-active:bg-[var(--zen-signal)]/70 group-hover:bg-[var(--zen-signal)]/70 sm:inset-y-4 sm:left-3 sm:w-1"
          aria-hidden
        />

        <div
          className={cn(
            "relative z-10 flex h-full min-h-[inherit] flex-col justify-end p-3 pl-4 sm:p-4 sm:pl-5",
            compact && "ml-[112px] min-h-[92px] justify-center py-3 pl-3",
          )}
        >
          <div className="mb-2 flex items-center gap-1.5 sm:mb-3 sm:gap-2">
            {contentType === "live" ? <ChannelHealthBadge score={healthScore} /> : null}
            <ChannelArtBadge parsed={parsed} contentType={contentType} />
          </div>
          <p className="line-clamp-2 text-[14px] font-semibold leading-tight tracking-[-0.025em] text-white sm:text-[16px]">
            {displayName}
          </p>
          {meta ? (
            <p className="mt-0.5 truncate text-[11px] font-medium text-white/48 sm:mt-1 sm:text-[12px]">
              {meta}
            </p>
          ) : null}
        </div>

        <span className="absolute bottom-2.5 right-2.5 z-20 flex size-8 items-center justify-center rounded-full bg-white/[0.14] text-white/90 ring-1 ring-white/[0.1] backdrop-blur-xl sm:bottom-3 sm:right-3 sm:size-10">
          <Play className="ml-0.5 size-3.5 fill-current sm:size-4" aria-hidden />
        </span>
      </div>

      {showFavoriteStar ? (
        <div className="absolute right-2.5 top-2.5 z-30 sm:right-3 sm:top-3">
          <FavoriteStarButton channel={channel} />
        </div>
      ) : null}
      {onPreview ? (
        <div className="absolute bottom-3 left-3 z-30">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview(channel);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-white/[0.16] bg-black/62 px-3 py-1.5 text-[12px] font-semibold text-white/88 outline-none backdrop-blur-xl",
              "hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
            )}
            aria-label={`Preview ${displayName}`}
          >
            <Tv className="size-3.5" aria-hidden />
            Preview
          </button>
        </div>
      ) : null}
    </article>
  );
}
