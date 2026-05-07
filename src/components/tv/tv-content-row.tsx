"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Parent already applies horizontal padding — avoid double inset on header + scroll rail. */
  bleed?: boolean;
  /**
   * Horizontal shelves use subtle fades at the scroll edges. Disable for non-scrolling
   * rows (e.g. a single full-width panel) so overlays don’t dim buttons at the sides.
   */
  edgeFade?: boolean;
};

export function TvContentRow({
  id,
  title,
  description,
  children,
  className,
  bleed = false,
  edgeFade = true,
}: Props) {
  return (
    <section id={id} className={cn("w-full", className)} aria-label={title}>
      <div
        className={cn(
          !bleed && "px-6 sm:px-10 lg:px-14 xl:px-20",
        )}
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-7">
          <div>
            <h2 className="text-[22px] font-semibold tracking-tight text-white sm:text-[24px]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 max-w-[520px] text-[15px] leading-snug text-white/48">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="relative">
        <div
          className={cn(
            "tv-row-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 pt-1 sm:gap-5",
            bleed
              ? "pl-0 pr-0"
              : "pl-6 pr-6 sm:pl-10 sm:pr-10 lg:pl-14 lg:pr-14 xl:pl-20 xl:pr-20",
            !bleed &&
              "[scroll-padding-inline:max(1.5rem,calc((100vw-1920px)/2+1.5rem))]",
          )}
        >
          {children}
        </div>
        {edgeFade ? (
          <>
            {/* Edge fades: tiles soften into the page background at both viewport edges */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-[30] w-12 bg-gradient-to-r from-[var(--tv-page-bg)] via-[color-mix(in_oklab,var(--tv-page-bg)_72%,transparent)] to-transparent sm:w-16 lg:w-24"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-[30] w-12 bg-gradient-to-l from-[var(--tv-page-bg)] via-[color-mix(in_oklab,var(--tv-page-bg)_72%,transparent)] to-transparent sm:w-16 lg:w-24"
              aria-hidden
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
