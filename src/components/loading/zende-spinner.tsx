import { cn } from "@/lib/utils";
import { Spinner } from "@appica/ui-react/spinner";

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
    <Spinner
      className={cn(
        size === "tiny" && "size-4",
        size === "small" && "size-5",
        size === "large" && "size-8",
        size === "full" && "size-12",
        className,
      )}
      aria-label={label}
    />
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
      <p className={cn("font-semibold text-foreground-intense", size === "full" ? "mt-6 text-lg" : "mt-3 text-sm")}>
        {label}
      </p>
      {description ? <p className="mt-1 max-w-md text-sm text-foreground-intense">{description}</p> : null}
    </div>
  );
}
