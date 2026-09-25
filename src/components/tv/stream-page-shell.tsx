"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StreamPageShellProps = {
  className?: string;
  pageClassName?: string;
  children: ReactNode;
};

/** Full-bleed night cinema backdrop shared by Favorites / Discover / Recordings. */
export function StreamPageShell({
  className,
  pageClassName,
  children,
}: StreamPageShellProps) {
  return (
    <div className={cn("stream-page relative min-h-screen text-[#e8eaf0]", pageClassName)}>
      <div className="stream-page-atmosphere" aria-hidden />
      <div className={cn("relative z-[1]", className)}>{children}</div>
    </div>
  );
}

type StreamPageHeroProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  artUrl?: string | null;
  actions?: ReactNode;
  search?: ReactNode;
  chips?: ReactNode;
  /** TV focus graph for the hero action row */
  focusProps?: Record<string, string | undefined>;
  className?: string;
};

/**
 * Immersive page identity — full-bleed art when available, otherwise a
 * soft brand wash. Designed for ten-foot titles, not admin KPI headers.
 */
export function StreamPageHero({
  eyebrow,
  title,
  subtitle,
  artUrl,
  actions,
  search,
  chips,
  focusProps,
  className,
}: StreamPageHeroProps) {
  return (
    <header className={cn("stream-page-hero", className)}>
      {artUrl ? (
        <div className="stream-page-hero-art" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artUrl} alt="" />
        </div>
      ) : null}
      <div className="stream-page-hero-shade" aria-hidden />
      <div className="stream-page-hero-inner">
        <div className="stream-page-hero-copy">
          <p className="stream-page-hero-eyebrow">{eyebrow}</p>
          <h1 className="stream-page-hero-title">{title}</h1>
          {subtitle ? <p className="stream-page-hero-subtitle">{subtitle}</p> : null}
        </div>
        {(search || actions) ? (
          <div
            className="stream-page-hero-tools"
            data-tv-layout="horizontal"
            {...focusProps}
          >
            {search}
            {actions}
          </div>
        ) : null}
        {chips ? <div className="stream-page-hero-chips">{chips}</div> : null}
      </div>
    </header>
  );
}

type StreamRailProps = {
  id?: string;
  title: string;
  meta?: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
};

/** Horizontal content shelf with streaming-style section title. */
export function StreamRail({
  id,
  title,
  meta,
  children,
  className,
  headerAction,
}: StreamRailProps) {
  return (
    <section id={id} className={cn("stream-rail", className)}>
      <div className="stream-rail-header">
        <div className="min-w-0">
          <h2 className="stream-rail-title">{title}</h2>
          {meta ? <p className="stream-rail-meta">{meta}</p> : null}
        </div>
        {headerAction}
      </div>
      <div className="stream-rail-track">{children}</div>
    </section>
  );
}
