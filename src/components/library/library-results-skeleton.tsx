"use client";

import { cn } from "@/lib/utils";

type Props = {
  view?: "posters" | "compact";
  count?: number;
  className?: string;
};

/** Keeps library page height stable while the first catalog page loads. */
export function LibraryResultsSkeleton({
  view = "posters",
  count = 24,
  className,
}: Props) {
  const items = Array.from({ length: count }, (_, index) => index);

  if (view === "compact") {
    return (
      <div
        className={cn("flex min-h-[70vh] flex-col gap-3", className)}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading library results"
      >
        {items.map((item) => (
          <div
            key={item}
            className="flex h-[76px] items-center gap-4 rounded-lg border border-border bg-background-muted p-3 ring-1 ring-border"
          >
            <div className="size-12 shrink-0 animate-pulse rounded-md bg-background" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-background" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-background" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("min-h-[70vh]", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading library results"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item) => (
          <div key={item} className="flex flex-col gap-2">
            <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-background-muted ring-1 ring-border" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-background-muted" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-background-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
