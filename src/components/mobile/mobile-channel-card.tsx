"use client";

import { Button } from "@appica/ui-react/button";

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
          "group relative w-full overflow-hidden rounded-lg text-left outline-none sm:rounded-lg",
          "border border-border bg-background-muted ring-1 ring-border",
          fastMode
            ? "shadow-lg transition-[background-color,border-color] duration-150"
            : "shadow-lg transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          !fastMode && "active:scale-[0.985] motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          fastMode
            ? "hover:border-border hover:bg-background-muted"
            : "motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-border motion-safe:hover:bg-background-muted motion-safe:hover:shadow-lg",
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
              <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-background via-background to-transparent" />
            </>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{ background: gradientFromName(displayName) }}
              />
              <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-background via-background to-transparent" />
            </>
          )}
        </div>
        <div
          className="pointer-events-none absolute inset-0 bg-background-subtle opacity-0 transition-opacity duration-300 group-active:opacity-100 group-hover:opacity-100"
          aria-hidden
        />
        <div
          className={cn(
            "relative z-10 flex h-full min-h-[inherit] flex-col justify-end p-3 sm:p-4",
            compact && "ml-[112px] min-h-[92px] justify-center py-3 pl-3",
          )}
        >
          <div className="mb-2 flex items-center gap-1.5 sm:mb-3 sm:gap-2">
            {contentType === "live" ? <ChannelHealthBadge score={healthScore} /> : null}
            <ChannelArtBadge parsed={parsed} contentType={contentType} />
          </div>
          <p className="line-clamp-2 text-[14px] font-semibold leading-tight tracking-[-0.025em] text-foreground-intense sm:text-[16px]">
            {displayName}
          </p>
          {meta ? (
            <p className="mt-0.5 truncate text-[11px] font-medium text-foreground-intense sm:mt-1 sm:text-[12px]">
              {meta}
            </p>
          ) : null}
        </div>

        <span className="absolute bottom-2.5 right-2.5 z-20 flex size-8 items-center justify-center rounded-full bg-background-muted text-foreground-intense ring-1 ring-border backdrop-blur-xl sm:bottom-3 sm:right-3 sm:size-10">
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
          <Button variant="ghost"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview(channel);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[12px] font-semibold text-foreground-intense outline-none backdrop-blur-xl",
              "hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-primary",
            )}
            aria-label={`Preview ${displayName}`}
          >
            <Tv className="size-3.5" aria-hidden />
            Preview
          </Button>
        </div>
      ) : null}
    </article>
  );
}
