import { cn } from "@/lib/utils";

export type ZendeSpinnerSize = "tiny" | "small" | "large" | "full";

type SpinnerProps = {
  size?: ZendeSpinnerSize;
  className?: string;
  label?: string;
};

/** One loading mark for page, panel, card, and inline processing states. */
export function ZendeSpinner({
  size = "small",
  className,
  label = "Loading",
}: SpinnerProps) {
  return (
    <span
      className={cn(
        "zende-spinner relative inline-grid shrink-0 place-items-center text-[#fd367e]",
        className,
      )}
      data-loading-size={size}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 48 48" fill="none" aria-hidden className="size-full">
        <circle
          className="zende-spinner-track"
          cx="24"
          cy="24"
          r="19"
          stroke="currentColor"
          strokeWidth="4"
        />
        <circle
          className="zende-spinner-arc"
          cx="24"
          cy="24"
          r="19"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
    </span>
  );
}

type LoadingStateProps = SpinnerProps & {
  description?: string;
};

/** Consistent round loader plus copy for full-page and section-level waiting states. */
export function ZendeLoadingState({
  size = "large",
  label = "Loading",
  description,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center text-center", className)}
      aria-live="polite"
      aria-busy="true"
    >
      <ZendeSpinner size={size} label={label} />
      <p className={cn("font-semibold text-white/90", size === "full" ? "mt-6 text-lg" : "mt-3 text-sm")}>
        {label}
      </p>
      {description ? <p className="mt-1 max-w-md text-sm text-white/50">{description}</p> : null}
    </div>
  );
}
