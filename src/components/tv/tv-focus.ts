import { cn } from "@/lib/utils";

/** tvOS-style focus: clear ring + subtle lift when motion is allowed */
export function tvTileFocusClass(className?: string) {
  return cn(
    "rounded-[26px] outline-none transition-[transform,box-shadow,filter] duration-200 ease-out",
    "focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-[var(--zen-signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tv-page-bg)]",
    "motion-safe:focus-visible:scale-[1.045] motion-safe:focus-visible:shadow-[0_26px_70px_-28px_rgba(56,217,255,0.42)]",
    className,
  );
}
