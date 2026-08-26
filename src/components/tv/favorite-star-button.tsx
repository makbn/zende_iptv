"use client";

import { Button } from "@appica/ui-react/button";

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
    <Button variant="ghost"
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
        "focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 focus-visible:ring-offset-black/90",
        "hover:scale-105 active:scale-95",
        active
          ? "bg-warning-subtle p-1.5 text-warning-strong shadow-lg"
          : "bg-background p-1.5 text-foreground-intense backdrop-blur-md hover:bg-background hover:text-foreground-intense",
        size === "md" && "p-2",
        className,
      )}
    >
      <Star
        className={cn(iconClass, active && "fill-current text-warning-strong")}
        aria-hidden
      />
    </Button>
  );
}
