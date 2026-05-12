"use client";

import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import type { KeyboardEvent } from "react";
import { ListMinus, Play, Star } from "lucide-react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";

import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { ChannelResolutionBadge } from "@/components/tv/channel-resolution-badge";
import { ChannelHealthBadge } from "@/components/health/channel-health-badge";
import { tvTileFocusClass } from "@/components/tv/tv-focus";
import type { HealthScoreDto } from "@/features/health/use-channel-health";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { cn } from "@/lib/utils";

export type TvChannelTileContextMenu = {
  onPlay: () => void;
  onAddFavorite: () => void;
  onRemoveFromRecent: () => void;
};

type Props = {
  channel: M3uChannel;
  onSelect?: (channel: M3uChannel) => void;
  healthScore?: HealthScoreDto;
  className?: string;
  /** Star overlay to add/remove favorites (default on). */
  showFavoriteStar?: boolean;
  /** Right-click / long-press menu (e.g. Recently Watched on home). */
  contextMenu?: TvChannelTileContextMenu;
};

function gradientFromName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 360;
  return `linear-gradient(145deg, oklch(0.35 0.12 ${h}) 0%, oklch(0.18 0.06 ${(h + 40) % 360}) 100%)`;
}

/** Hide playlist placeholders (e.g. "Undefined") when there is no useful group label. */
function channelMetaLine(groupTitle?: string): string | null {
  const raw = groupTitle?.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "undefined" || lower === "unknown" || lower === "n/a" || lower === "na") {
    return null;
  }
  return raw;
}

export function TvChannelTile({
  channel,
  onSelect,
  healthScore,
  className,
  showFavoriteStar = true,
  contextMenu,
}: Props) {
  const { displayName, resolutionLabel } = parseChannelLabel(
    channel.name?.trim() || "Untitled",
  );
  const label = displayName;
  const meta = channelMetaLine(channel.groupTitle);

  const open = () => onSelect?.(channel);

  const onTileKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  const articleClass = cn(
    "group relative w-[260px] shrink-0 snap-start sm:w-[288px]",
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
            "relative aspect-video w-full overflow-hidden rounded-2xl",
            "bg-zinc-900/90 ring-1 ring-white/[0.08]",
            "shadow-[0_16px_48px_-12px_rgba(0,0,0,0.75)]",
            "transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
            "group-hover:shadow-[0_28px_60px_-14px_rgba(0,0,0,0.88)] motion-safe:group-hover:scale-[1.025] motion-safe:group-hover:ring-white/[0.12]",
          )}
        >
          {channel.tvgLogo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={channel.tvgLogo}
                alt=""
                className="absolute inset-0 m-auto max-h-[72%] max-w-[78%] object-contain opacity-[0.96]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            </>
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center p-6"
              style={{ background: gradientFromName(label) }}
            >
              <span className="text-center text-[15px] font-semibold leading-snug text-white/95 drop-shadow-sm">
                {label}
              </span>
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
          )}
          <div className="absolute left-2 top-2 z-10">
            <ChannelHealthBadge score={healthScore} />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3 pt-8">
            <p className="line-clamp-2 text-[14px] font-semibold leading-tight text-white drop-shadow-md">
              {label}
            </p>
            {meta ? (
              <p className="mt-0.5 truncate text-[12px] font-medium text-white/55">
                {meta}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {resolutionLabel || showFavoriteStar ? (
        <div className="pointer-events-none absolute right-2 top-2 z-20 flex flex-col items-end gap-1">
          {resolutionLabel ? (
            <div className="pointer-events-auto">
              <ChannelResolutionBadge label={resolutionLabel} />
            </div>
          ) : null}
          {showFavoriteStar ? (
            <div className="pointer-events-auto">
              <FavoriteStarButton channel={channel} />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const glassPopupClass =
    "min-w-[220px] rounded-2xl border border-white/[0.14] bg-black/55 p-1 shadow-2xl outline-none backdrop-blur-2xl backdrop-saturate-150";

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
