import { cn } from "@/lib/utils";

export function HomeShelfSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <section className={cn("animate-pulse", compact ? "px-4" : "w-full")} aria-label="Loading recommendations" aria-busy="true">
      <div className="h-5 w-40 rounded-lg bg-background-muted" />
      <div className="mt-2 h-3 w-64 max-w-full rounded-lg bg-background-muted" />
      <div className="mt-4 flex gap-3 overflow-hidden">
        {Array.from({ length: compact ? 3 : 7 }, (_, index) => (
          <div key={index} className={cn("shrink-0 rounded-lg border border-border bg-background", compact ? "w-40" : "w-64 sm:w-72")}>
            <div className={cn("rounded-t-lg bg-background-muted", compact ? "aspect-[2/3]" : "aspect-video")} />
            <div className="space-y-2 p-3">
              <div className="h-4 w-4/5 rounded-lg bg-background-muted" />
              <div className="h-3 w-1/2 rounded-lg bg-background-muted" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
