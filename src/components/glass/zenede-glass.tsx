"use client";

import dynamic from "next/dynamic";
import {
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

import { BrowseShellRefContext } from "@/components/glass/browse-chrome";
import {
  GLASS_PRESETS,
  type GlassVariant,
} from "@/components/glass/glass-presets";
import { cn } from "@/lib/utils";

const LiquidGlass = dynamic(
  () => import("liquid-glass-react").then((m) => m.default),
  { ssr: false },
);

/** Opt-in: liquid-glass-react uses centered positioning that breaks full-width UI — default off. */
const LIQUID_GLASS_ENABLED =
  process.env.NEXT_PUBLIC_LIQUID_GLASS === "true";
const LIQUID_VARIANTS = new Set<GlassVariant>(["heroPrimary", "ctaPill"]);

let hydratedFlag = false;

function subscribeHydrated(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  queueMicrotask(() => {
    if (!hydratedFlag) {
      hydratedFlag = true;
      onStoreChange();
    }
  });
  return () => {};
}

function getHydratedSnapshot() {
  return hydratedFlag;
}

function getHydratedServerSnapshot() {
  return false;
}

function subscribeReducedMotion(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function GlassFallback({
  variant,
  className,
  style,
  children,
}: {
  variant: GlassVariant;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const base = {
    navRail:
      "border-b border-white/[0.1] bg-black/48 backdrop-blur-xl supports-[backdrop-filter]:bg-black/38",
    heroPrimary:
      "bg-[var(--zen-frost)] text-[var(--zen-void)] shadow-[0_18px_52px_-18px_rgba(56,217,255,0.45)] ring-1 ring-white/35",
    heroSecondary:
      "border border-white/[0.18] bg-white/[0.075] backdrop-blur-xl ring-1 ring-white/[0.06]",
    panel:
      "zen-panel ring-1 ring-white/[0.055]",
    panelCompact:
      "border border-white/[0.11] bg-white/[0.065] backdrop-blur-xl ring-1 ring-white/[0.055] shadow-[0_18px_60px_-34px_rgba(0,0,0,0.88)]",
    surface:
      "zen-card backdrop-blur-xl ring-1 ring-white/[0.05]",
    mediaCard:
      "border border-white/[0.11] bg-white/[0.06] backdrop-blur-xl ring-1 ring-white/[0.05] shadow-[0_24px_70px_-38px_rgba(0,0,0,0.9)]",
    iconChip:
      "border border-white/[0.13] bg-white/[0.075] backdrop-blur-xl ring-1 ring-white/[0.055] shadow-[0_12px_36px_-24px_rgba(0,0,0,0.9)]",
    ctaPill:
      "bg-[var(--zen-frost)] text-[var(--zen-void)] shadow-[0_16px_44px_-18px_rgba(56,217,255,0.45)] ring-1 ring-white/30",
    danger:
      "border border-red-400/25 bg-red-950/35 text-red-50 backdrop-blur-xl ring-1 ring-red-300/10",
  }[variant];

  const radius =
    variant === "heroPrimary" ||
    variant === "heroSecondary" ||
    variant === "ctaPill" ||
    variant === "iconChip"
      ? "rounded-full"
      : variant === "panel"
        ? "rounded-[32px]"
        : variant === "panelCompact" || variant === "surface" || variant === "danger"
          ? "rounded-[24px]"
          : variant === "mediaCard"
            ? "rounded-[26px]"
            : "";

  return (
    <div
      className={cn(
        radius,
        base,
        "transition-[box-shadow,transform,border-color,background-color,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export type ZenedeGlassProps = {
  variant: GlassVariant;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Frosted “glass” surfaces. By default uses CSS backdrop blur — reliable for full-width
 * shells (nav, panels, rails).
 *
 * Optional [liquid-glass-react](https://github.com/rdev/liquid-glass-react): set
 * `NEXT_PUBLIC_LIQUID_GLASS=true` at build time. That library centers each instance with
 * `top/left: 50%` and `translate(-50%,-50%)`, which breaks full-width layout if enabled
 * unconditionally — hence opt-in only.
 */
export function ZenedeGlass({
  variant,
  className,
  style,
  children,
}: ZenedeGlassProps) {
  const shellRef = useContext(BrowseShellRefContext);
  const isClient = useSyncExternalStore(
    subscribeHydrated,
    getHydratedSnapshot,
    getHydratedServerSnapshot,
  );
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );

  const preset = GLASS_PRESETS[variant];

  const canUseLiquid =
    LIQUID_GLASS_ENABLED && LIQUID_VARIANTS.has(variant);

  if (!isClient || reduceMotion || !canUseLiquid) {
    return (
      <GlassFallback variant={variant} className={className} style={style}>
        {children}
      </GlassFallback>
    );
  }

  return (
    <LiquidGlass
      {...preset}
      mouseContainer={shellRef ?? undefined}
      className={cn(
        "transition-[transform,filter] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] will-change-transform",
        "motion-safe:active:scale-[0.985]",
        className,
      )}
      style={style}
    >
      {children}
    </LiquidGlass>
  );
}
