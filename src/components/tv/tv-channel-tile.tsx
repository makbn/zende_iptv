"use client";

import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
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
      {/* div[role=button]: avoids invalid <button> nesting if badge/star tooling renders controls */}
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={onTileKeyDown}
        aria-label={`Play ${label}`}
        className={cn(
          "relative block w-full cursor-pointer text-left",
          tvTileFocusClass(),
        )}
      >
        <div
          className={cn(
            "poster-tile__frame rounded-[28px]",
            "border border-white/[0.11] bg-zinc-950/90 ring-1 ring-white/[0.06]",
            fastMode
              ? "shadow-[0_12px_34px_-21px_rgba(0,0,0,0.8)]"
              : "shadow-[0_24px_70px_-30px_rgba(0,0,0,0.94)] transition-[transform,box-shadow,border-color,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-hover:border-white/[0.2] group-hover:shadow-[0_38px_90px_-30px_rgba(0,0,0,0.96)] motion-safe:group-hover:scale-[1.022] motion-safe:group-hover:ring-white/[0.12]",
          )}
        >
          {channel.tvgLogo ? (
            <>
              <ChannelLogo
                name={label}
                logoUrl={channel.tvgLogo}
                fit="cover"
                aspect="fill"
              />
              <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/82 via-black/36 to-transparent" />
            </>
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center p-6"
              style={{ background: gradientFromName(label) }}
            >
              <span className="text-center text-[15px] font-semibold leading-snug text-white/95 drop-shadow-sm">
                {label}
              </span>
              <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/74 via-black/26 to-transparent" />
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0_36%,rgba(255,255,255,0.12)_46%,transparent_58%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-y-4 left-3 w-1 rounded-full bg-[var(--zen-signal)]/0 transition-colors duration-300 group-hover:bg-[var(--zen-signal)]/70"
            aria-hidden
          />
          <div className="absolute left-2 top-2 z-10">
            {contentType === "live" ? <ChannelHealthBadge score={healthScore} /> : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3.5 pt-8">
            <p className="line-clamp-2 text-[15px] font-semibold leading-tight tracking-[-0.02em] text-white drop-shadow-md">
              {label}
            </p>
            {meta ? (
              <p className="mt-1 truncate text-[12px] font-medium text-white/58">
                {meta}
              </p>
            ) : null}
          </div>
        </div>
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
        <div className="pointer-events-auto absolute bottom-2 right-2 z-20">
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
            aria-label={`Preview ${label}`}
          >
            <Tv className="h-3.5 w-3.5" aria-hidden />
            Preview
          </button>
        </div>
      ) : null}
    </>
  );

  const glassPopupClass =
    "min-w-[220px] rounded-[22px] border border-white/[0.14] bg-black/72 p-1.5 shadow-2xl outline-none backdrop-blur-2xl backdrop-saturate-150";

  if (!contextMenu) {
    return (
      <article className={articleClass}>
        {shell}
      </article>
    );
  }

  const { onPlay, onAddFavorite, onRemoveFromRecent } = contextMenu;

  return (
    <ContextMenu.Root>
      <article className={articleClass}>
        <ContextMenu.Trigger className="relative block w-full outline-none">
          {shell}
        </ContextMenu.Trigger>
      </article>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-[100]" sideOffset={8}>
          <ContextMenu.Popup className={glassPopupClass}>
            <Menu.Viewport>
              <ContextMenu.Item
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] text-white/90 outline-none",
                  "data-[highlighted]:bg-white/12",
                )}
                onClick={onPlay}
              >
                <Play className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Play
              </ContextMenu.Item>
              <ContextMenu.Item
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] text-white/90 outline-none",
                  "data-[highlighted]:bg-white/12",
                )}
                onClick={onAddFavorite}
              >
                <Star className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Add to favorites
              </ContextMenu.Item>
              <ContextMenu.Item
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] text-white/90 outline-none",
                  "data-[highlighted]:bg-white/12",
                )}
                onClick={onRemoveFromRecent}
              >
                <ListMinus className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Remove from recently watched
              </ContextMenu.Item>
            </Menu.Viewport>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
