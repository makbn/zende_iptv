"use client";

import { Button } from "@appica/ui-react/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardMedia,
  CardTitle,
} from "@appica/ui-react/card";

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@appica/ui-react/context-menu";
import type { KeyboardEvent } from "react";
import { ListMinus, Play, Star, Tv } from "lucide-react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";

import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { ChannelHealthBadge } from "@/components/health/channel-health-badge";
import {
  ChannelArtBadge,
  ChannelLogo,
  gradientFromChannelName,
  sanitizeGroupTitle,
} from "@/components/channels/channel-presentation";
import { tvTileFocusClass } from "@/components/tv/tv-focus";
import type { HealthScoreDto } from "@/features/health/use-channel-health";
import { channelArtBadgeLabel, parseChannelLabel } from "@/lib/channel/channel-label";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { cn } from "@/lib/utils";

export type TvChannelTileContextMenu = {
  onPlay: () => void;
  onAddFavorite: () => void;
  onRemoveFromRecent: () => void;
};

type Props = {
  channel: M3uChannel;
  onSelect?: (channel: M3uChannel) => void;
  onPreview?: (channel: M3uChannel) => void;
  fastMode?: boolean;
  healthScore?: HealthScoreDto;
  className?: string;
  /** Star overlay to add/remove favorites (default on). */
  showFavoriteStar?: boolean;
  /** Right-click / long-press menu (e.g. Recently Watched on home). */
  contextMenu?: TvChannelTileContextMenu;
};

function gradientFromName(name: string) {
  return gradientFromChannelName(name);
}

function channelMetaLine(groupTitle?: string): string | null {
  return sanitizeGroupTitle(groupTitle);
}

export function TvChannelTile({
  channel,
  onSelect,
  onPreview,
  fastMode = true,
  healthScore,
  className,
  showFavoriteStar = true,
  contextMenu,
}: Props) {
  const parsed = parseChannelLabel(channel.name?.trim() || "Untitled");
  const { displayName: label } = parsed;
  const meta = channelMetaLine(channel.groupTitle);
  const contentType = resolveLibraryContentType(channel);

  const open = () => onSelect?.(channel);

  const onTileKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  const fillsGridCell = className?.includes("poster-grid__tile");
  const articleClass = cn(
    "group relative snap-start",
    fillsGridCell ? "w-full min-w-0" : "w-[178px] shrink-0 sm:w-[214px]",
    className,
  );

  const shell = (
    <>
      {/* div[role=button]: avoids invalid <Button variant="ghost"> nesting if badge/star tooling renders controls */}
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={onTileKeyDown}
        aria-label={`Play ${label}`}
        className={cn(
          "block w-full cursor-pointer text-left",
          tvTileFocusClass(),
        )}
      >
        <Card frame="solid" inset>
          <CardMedia className="aspect-[2/3] bg-background-muted">
            {channel.tvgLogo ? (
              <ChannelLogo
                name={label}
                logoUrl={channel.tvgLogo}
                fit="cover"
                aspect="fill"
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center p-6"
                style={{ background: gradientFromName(label) }}
              >
                <span className="text-center text-sm font-semibold leading-snug text-foreground-intense">
                  {label}
                </span>
              </div>
            )}
            {contentType === "live" ? (
              <div className="absolute left-2 top-2 z-10">
                <ChannelHealthBadge score={healthScore} />
              </div>
            ) : null}
          </CardMedia>
          <CardHeader className="min-h-24">
            <CardTitle className="line-clamp-2 text-base">{label}</CardTitle>
            {meta ? <CardDescription className="truncate">{meta}</CardDescription> : null}
          </CardHeader>
        </Card>
      </div>
      {(channelArtBadgeLabel(parsed, contentType) || showFavoriteStar) ? (
        <div className="pointer-events-none absolute right-2 top-2 z-20 flex flex-col items-end gap-1">
          {channelArtBadgeLabel(parsed, contentType) ? (
            <div className="pointer-events-auto">
              <ChannelArtBadge parsed={parsed} contentType={contentType} />
            </div>
          ) : null}
          {showFavoriteStar ? (
            <div className="pointer-events-auto">
              <FavoriteStarButton channel={channel} />
            </div>
          ) : null}
        </div>
      ) : null}
      {onPreview ? (
        <div className="pointer-events-auto absolute bottom-4 right-4 z-20">
          <Button variant="secondary"
            size="sm"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview(channel);
            }}
            aria-label={`Preview ${label}`}
          >
            <Tv className="h-3.5 w-3.5" aria-hidden />
            Preview
          </Button>
        </div>
      ) : null}
    </>
  );

  if (!contextMenu) {
    return (
      <article className={articleClass}>
        {shell}
      </article>
    );
  }

  const { onPlay, onAddFavorite, onRemoveFromRecent } = contextMenu;

  return (
    <ContextMenu>
      <article className={articleClass}>
        <ContextMenuTrigger className="relative block w-full outline-none">
          {shell}
        </ContextMenuTrigger>
      </article>
      <>
        <ContextMenuContent className="z-[100]" sideOffset={8}>
          <div>
            <div>
              <ContextMenuItem
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-intense outline-none",
                  "data-[highlighted]:bg-background-muted",
                )}
                onClick={onPlay}
              >
                <Play className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Play
              </ContextMenuItem>
              <ContextMenuItem
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-intense outline-none",
                  "data-[highlighted]:bg-background-muted",
                )}
                onClick={onAddFavorite}
              >
                <Star className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Add to favorites
              </ContextMenuItem>
              <ContextMenuItem
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-intense outline-none",
                  "data-[highlighted]:bg-background-muted",
                )}
                onClick={onRemoveFromRecent}
              >
                <ListMinus className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Remove from recently watched
              </ContextMenuItem>
            </div>
          </div>
        </ContextMenuContent>
      </>
    </ContextMenu>
  );
}
