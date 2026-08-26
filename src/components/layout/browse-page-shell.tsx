import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Vertical clearance below floating TV nav (`pt-20` / `top-20`). */
export const BROWSE_TOP_PAD = "pt-20";
export const BROWSE_STICKY_TOP = "top-20";
/** Clears mobile bottom tab bar. */
export const BROWSE_BOTTOM_PAD_MOBILE = "pb-28";
/** Anchor offset for hash-linked shelves on mobile. */
export const MOBILE_SCROLL_MT = "scroll-mt-24";
/** Shared content width and horizontal rhythm for TV/desktop browse pages. */
export const BROWSE_CONTAINER_CLASS =
  "mx-auto w-full px-4 sm:px-6 lg:px-8";
/** Dense poster grid — fills container width, aligns with filter bars above. */
export const POSTER_GRID_CLASS = "poster-grid";
/** Poster tile sizing inside {@link POSTER_GRID_CLASS}. */
export const POSTER_GRID_TILE_CLASS = "poster-grid__tile";
/** Shared mobile page gutter. */
export const BROWSE_MOBILE_GUTTER_CLASS = "px-4";

/** @deprecated Use BROWSE_TOP_PAD — kept for gradual migration. */
export const TV_BROWSE_TOP_PAD_CLASS = BROWSE_TOP_PAD;
/** @deprecated Use BROWSE_STICKY_TOP */
export const TV_BROWSE_STICKY_TOP_CLASS = BROWSE_STICKY_TOP;

type BrowsePageShellProps = {
  children: ReactNode;
  className?: string;
  /** When true, adds bottom padding for mobile tab bar. */
  mobileBottomPad?: boolean;
  id?: string;
};

export function BrowsePageShell({
  children,
  className,
  mobileBottomPad = true,
  id = "main",
}: BrowsePageShellProps) {
  return (
    <main
      id={id}
      tabIndex={-1}
      className={cn(
        "relative min-h-screen bg-background-subtle text-foreground-intense outline-none",
        BROWSE_TOP_PAD,
        mobileBottomPad && BROWSE_BOTTOM_PAD_MOBILE,
        "md:pb-16",
        className,
      )}
    >
      
      {children}
    </main>
  );
}
