import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
};

export function EmptyStateCard({ title, description, children, className }: Props) {
  return (
    <div
      className={cn(
        "border border-border bg-background-subtle shadow-sm relative isolate flex flex-col justify-center overflow-hidden rounded-lg px-8 py-12",
        className,
      )}
      role="status"
    >
      <div
        className="absolute -right-16 -top-20 h-44 w-44 rounded-full bg-primary blur-3xl"
        aria-hidden
      />
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Nothing here yet</p>
      <p className="mt-3 text-[22px] font-semibold tracking-[-0.04em] text-foreground-intense">
        {title}
      </p>
      <p className="text-sm text-foreground-muted mt-2 max-w-2xl">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
