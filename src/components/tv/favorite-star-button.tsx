"use client";

import { Star } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import {
  isFavorite,
  subscribeFavoriteUrl,
  toggleFavorite,
} from "@/lib/favorites/favorites-store";
import { cn } from "@/lib/utils";

export type FavoriteStarChannel = Pick<M3uChannel, "url" | "name"> &
  Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle">>;

type Props = {
  channel: FavoriteStarChannel;
  className?: string;
  size?: "sm" | "md";
};

export function FavoriteStarButton({
  channel,
  className,
  size = "sm",
}: Props) {
  const active = useSyncExternalStore(
    (onChange) => subscribeFavoriteUrl(channel.url, onChange),
    () => isFavorite(channel.url),
    () => false,
  );
  const iconClass =
    size === "md" ? "size-[22px]" : "size-[18px] stroke-[2.25px]";

  return (
    <button
      type="button"
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(channel);
      }}
      className={cn(
        "rounded-xl outline-none transition-[transform,colors,background-color] duration-200",
        "focus-visible:ring-2 focus-visible:ring-amber-400/90 focus-visible:ring-offset-2 focus-visible:ring-offset-black/90",
        "hover:scale-105 active:scale-95",
        active
          ? "bg-amber-400/15 p-1.5 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)]"
          : "bg-black/45 p-1.5 text-white/55 backdrop-blur-md hover:bg-black/55 hover:text-white/88",
        size === "md" && "p-2",
        className,
      )}
    >
      <Star
        className={cn(iconClass, active && "fill-amber-400 text-amber-300")}
        aria-hidden
      />
    </button>
  );
}
