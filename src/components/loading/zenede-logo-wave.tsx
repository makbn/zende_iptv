import { cn } from "@/lib/utils";

/** Paths from `public/zenede-logo.svg` (same pink bars). */
const BAR_PATHS = [
  "M17 393l0 60c0,24 36,24 36,0l0 -60c0,-23 -36,-24 -36,0z",
  "M87 393l0 60c0,24 36,24 36,0l0 -60c1,-23 -36,-24 -36,0z",
  "M158 368l0 111c0,24 36,24 36,0l0 -111c0,-24 -36,-24 -36,0z",
  "M229 338l0 171c0,24 36,24 36,0l0 -171c0,-24 -36,-24 -36,0z",
  "M299 285l0 277c0,24 36,24 36,0l0 -277c0,-24 -36,-24 -36,0z",
  "M370 159l0 528c0,24 36,24 36,0l0 -528c0,-24 -36,-24 -36,0z",
  "M441 204l0 438c0,24 36,24 36,0l0 -438c0,-24 -36,-24 -36,0z",
  "M511 294l0 259c0,23 36,23 36,0l0 -259c0,-24 -36,-24 -36,0z",
  "M582 348l0 150c0,24 36,24 36,0l0 -150c0,-23 -36,-23 -36,0z",
  "M653 371l0 104c0,24 36,24 36,0l0 -104c0,-23 -36,-23 -36,0z",
  "M723 393l0 60c0,24 36,24 36,0l0 -60c0,-23 -36,-23 -36,0z",
  "M794 393l0 60c0,24 36,24 36,0l0 -60c0,-23 -36,-23 -36,0z",
] as const;

const GROUP_MATRIX =
  "matrix(0.2767527675276753 0 0 0.2767527675276753 9.29520295202952 -39.02214022140222)";

const WIDTH_CLASS = {
  sm: "w-[min(42vw,140px)]",
  md: "w-[min(56vw,200px)]",
  lg: "w-[min(72vw,280px)]",
} as const;

export function ZenedeLogoWave({
  className,
  size = "lg",
}: {
  className?: string;
  size?: keyof typeof WIDTH_CLASS;
}) {
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="14 5 225 82"
        fill="none"
        className={cn(
          "relative z-0 block h-auto text-[#fd367e]",
          WIDTH_CLASS[size],
        )}
        aria-hidden
      >
        <g fill="currentColor" transform={GROUP_MATRIX}>
          {BAR_PATHS.map((d, i) => (
            <path
              key={i}
              d={d}
              className="zende-wave-bar"
              style={{
                animationDelay: `${i * 72}ms`,
              }}
            />
          ))}
        </g>
      </svg>
      <div
        className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[2px]"
        aria-hidden
      >
        <div className="zende-logo-shimmer absolute inset-y-[-15%] left-0 w-[48%] bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-[0.85] mix-blend-screen" />
      </div>
    </div>
  );
}
