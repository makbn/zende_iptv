import { ZendeLoadingState } from "@/components/loading/zende-spinner";
import { BROWSE_TOP_PAD } from "@/components/layout/browse-page-shell";
import { cn } from "@/lib/utils";

export function BrowsePageFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "zen-page-bg flex min-h-screen flex-col items-center justify-center",
        BROWSE_TOP_PAD,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <ZendeLoadingState
        size="full"
        label="Tuning signal"
        description="Loading your channels…"
      />
    </div>
  );
}
