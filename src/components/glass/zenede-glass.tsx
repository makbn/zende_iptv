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
  const base =
    variant === "heroPrimary" || variant === "ctaPill"
      ? "bg-white/[0.92] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)] ring-1 ring-black/10"
      : variant === "navRail"
        ? "border-b border-white/[0.08] bg-black/40 backdrop-blur-2xl backdrop-saturate-150"
        : variant === "heroSecondary"
          ? "border border-white/[0.18] bg-white/[0.08] backdrop-blur-xl"
          : variant === "iconChip"
            ? "border border-white/[0.14] bg-white/[0.07] backdrop-blur-xl"
            : "border border-white/[0.1] bg-white/[0.06] backdrop-blur-2xl ring-1 ring-white/[0.06]";

  const radius =
    variant === "heroPrimary" ||
    variant === "heroSecondary" ||
    variant === "ctaPill" ||
    variant === "iconChip"
      ? "rounded-full"
      : variant === "panel"
        ? "rounded-[28px]"
        : variant === "panelCompact"
          ? "rounded-[22px]"
          : "";

  return (
    <div className={cn(radius, base, className)} style={style}>
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

  if (!isClient || reduceMotion || !LIQUID_GLASS_ENABLED) {
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
