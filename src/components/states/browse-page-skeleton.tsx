import { cn } from "@/lib/utils";
import { BROWSE_CONTAINER_CLASS, BROWSE_TOP_PAD } from "@/components/layout/browse-page-shell";
import { ZendeSpinner } from "@/components/loading/zende-spinner";

export function BrowsePageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-background min-h-screen",
        BROWSE_TOP_PAD,
        "pb-28 md:pb-16",
        className,
      )}
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className={cn(BROWSE_CONTAINER_CLASS, "space-y-8 pt-6")}>
        <div className="flex items-center gap-3 text-sm font-medium text-foreground-intense">
          <ZendeSpinner size="small" label="Loading page" />
          Loading page…
        </div>
        <div className="h-10 w-48 animate-pulse rounded-2xl bg-background-muted" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[168px] w-[220px] shrink-0 animate-pulse rounded-lg bg-background-muted ring-1 ring-border"
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-background-muted ring-1 ring-border"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
