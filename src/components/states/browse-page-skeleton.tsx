import { cn } from "@/lib/utils";
import { BROWSE_TOP_PAD } from "@/components/layout/browse-page-shell";
import { ZendeSpinner } from "@/components/loading/zende-spinner";

export function BrowsePageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "zen-page-bg min-h-screen",
        BROWSE_TOP_PAD,
        "px-4 pb-28 md:pb-16",
        className,
      )}
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="mx-auto max-w-6xl space-y-8 pt-6">
        <div className="flex items-center gap-3 text-sm font-medium text-white/55">
          <ZendeSpinner size="small" label="Loading page" />
          Loading page…
        </div>
        <div className="h-10 w-48 animate-pulse rounded-2xl bg-white/[0.09]" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[168px] w-[220px] shrink-0 animate-pulse rounded-[26px] bg-white/[0.065] ring-1 ring-white/[0.06]"
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-[22px] bg-white/[0.055] ring-1 ring-white/[0.05]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
