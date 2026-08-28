"use client";

import { Button } from "@appica/ui-react/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@appica/ui-react/context-menu";
import type { KeyboardEvent } from "react";
import { ListMinus, Play, Star, Tv } from "lucide-react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";

import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { MovieDownloadButton } from "@/components/library/movie-download-button";
import { ChannelHealthBadge } from "@/components/health/channel-health-badge";
import {
  ChannelArtBadge,
  ChannelLogo,
  gradientFromChannelName,
  sanitizeGroupTitle,
} from "@/components/channels/channel-presentation";
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
  healthScore,
  className,
  showFavoriteStar = true,
  contextMenu,
}: Props) {
  const parsed = parseChannelLabel(channel.name?.trim() || "Untitled");
  const { displayName: label } = parsed;
  const meta = channelMetaLine(channel.groupTitle);
  const sourceMeta = [channel.providerName, meta].filter(Boolean).join(" · ") || null;
  const contentType = resolveLibraryContentType(channel);

  const open = () => onSelect?.(channel);

  const onTileKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };


  const tileContent = (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onTileKeyDown}
      aria-label={`Play ${label}`}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-background-subtle text-left snap-start",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        !className?.includes("w-full") && "w-[178px] shrink-0 sm:w-[214px]",
        className,
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-background-muted">
        {channel.tvgLogo ? (
          <ChannelLogo
            name={label}
            logoUrl={channel.tvgLogo}
            fit="cover"
            aspect="fill"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center p-4"
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
      </div>

      <div className="flex min-h-[4.5rem] flex-col justify-center p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight text-foreground-intense">
          {label}
        </h3>
        {sourceMeta ? (
          <p className="mt-1 truncate text-xs text-foreground-muted">{sourceMeta}</p>
        ) : null}
      </div>

      {(channelArtBadgeLabel(parsed, contentType) || showFavoriteStar || contentType === "movie") ? (
        <div className="pointer-events-none absolute right-2 top-2 z-20 flex flex-col items-end gap-1">
          {channelArtBadgeLabel(parsed, contentType) ? (
            <div className="pointer-events-auto">
              <ChannelArtBadge parsed={parsed} contentType={contentType} />
            </div>
          ) : null}
          <div className="pointer-events-auto flex items-center gap-1">
            {contentType === "movie" ? <MovieDownloadButton channel={channel} /> : null}
            {showFavoriteStar ? <FavoriteStarButton channel={channel} /> : null}
          </div>
        </div>
      ) : null}

      {onPreview ? (
        <div className="pointer-events-auto mt-auto border-t border-border px-2.5 py-2">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            className="w-full"
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
    </div>
  );

  if (!contextMenu) {
    return tileContent;
  }

  const { onPlay, onAddFavorite, onRemoveFromRecent } = contextMenu;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block outline-none">
        {tileContent}
      </ContextMenuTrigger>
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
    </ContextMenu>
  );
}
