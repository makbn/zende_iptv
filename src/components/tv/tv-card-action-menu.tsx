"use client";

import { Button } from "@appica/ui-react/button";
import { Play, Star, StarOff, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent } from "react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { isFavorite, subscribeFavoriteUrl, toggleFavorite } from "@/lib/favorites/favorites-store";
import type { LibraryContentType } from "@/lib/channels/content-type";

type Props = {
  channel: M3uChannel;
  contentType: LibraryContentType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrimaryAction: () => void;
  onRemoveFromRecent?: () => void;
};

function primaryLabel(contentType: LibraryContentType): string {
  if (contentType === "movie") return "Open movie";
  if (contentType === "series") return "Open series";
  return "Play channel";
}

export function TvCardActionMenu({
  channel,
  contentType,
  open,
  onOpenChange,
  onPrimaryAction,
  onRemoveFromRecent,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const favorite = useSyncExternalStore(
    (onChange) => subscribeFavoriteUrl(channel.url, onChange),
    () => isFavorite(channel.url),
    () => false,
  );

  useLayoutEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const close = () => onOpenChange(false);
  const run = (action: () => void) => {
    close();
    action();
  };
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = current;
    if (event.key === "Enter" || event.key === " " || event.keyCode === 23 || event.keyCode === 66) {
      event.preventDefault();
      event.stopPropagation();
      items[current]?.click();
      return;
    } else if (
      event.key === "ArrowDown" ||
      event.key === "ArrowRight" ||
      event.keyCode === 20 ||
      event.keyCode === 22
    ) next = (current + 1) % items.length;
    else if (
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft" ||
      event.keyCode === 19 ||
      event.keyCode === 21
    ) next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-10 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${channel.name || "this item"}`}
        onKeyDown={onMenuKeyDown}
        className="w-full max-w-xl rounded-2xl border border-border bg-background p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Actions</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-foreground-intense">
              {channel.name?.trim() || "Untitled"}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon-md" onClick={close} aria-label="Close actions">
            <X aria-hidden />
          </Button>
        </div>

        <div className="grid gap-3">
          <Button
            ref={primaryRef}
            autoFocus
            type="button"
            role="menuitem"
            size="lg"
            className="min-h-14 justify-start gap-3 text-lg focus-visible:ring-4 focus-visible:ring-primary"
            onClick={() => run(onPrimaryAction)}
          >
            <Play className="size-5" aria-hidden />
            {primaryLabel(contentType)}
          </Button>
          <Button
            type="button"
            role="menuitem"
            variant="secondary"
            size="lg"
            className="min-h-14 justify-start gap-3 text-lg focus-visible:ring-4 focus-visible:ring-primary"
            onClick={() => run(() => toggleFavorite(channel))}
          >
            {favorite ? <StarOff className="size-5" aria-hidden /> : <Star className="size-5" aria-hidden />}
            {favorite ? "Remove from favorites" : "Add to favorites"}
          </Button>
          {onRemoveFromRecent ? (
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              size="lg"
              className="min-h-14 justify-start gap-3 text-lg focus-visible:ring-4 focus-visible:ring-primary"
              onClick={() => run(onRemoveFromRecent)}
            >
              <Trash2 className="size-5" aria-hidden />
              Remove from recently watched
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
