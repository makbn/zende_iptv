import { cn } from "@/lib/utils";

/** tvOS-style focus: clear ring + subtle lift when motion is allowed */
export function tvTileFocusClass(className?: string) {
  return cn(
    "rounded-2xl outline-none transition-[transform,box-shadow] duration-200 ease-out",
    "focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tv-page-bg)]",
    "motion-safe:focus-visible:scale-[1.045]",
    className,
  );
}
