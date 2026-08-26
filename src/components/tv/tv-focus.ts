import { cn } from "@/lib/utils";

/** tvOS-style focus: clear ring + subtle lift when motion is allowed */
export function tvTileFocusClass(className?: string) {
  return cn(
    "rounded-[26px] outline-none transition-[transform,box-shadow,filter] duration-200 ease-out",
    "focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className,
  );
}
