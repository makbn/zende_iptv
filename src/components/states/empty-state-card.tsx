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
        "zen-panel relative isolate flex flex-col justify-center overflow-hidden rounded-[28px] px-8 py-12",
        className,
      )}
      role="status"
    >
      <div
        className="absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[var(--zen-signal)]/10 blur-3xl"
        aria-hidden
      />
      <p className="zen-kicker">Nothing here yet</p>
      <p className="mt-3 text-[22px] font-semibold tracking-[-0.04em] text-white">
        {title}
      </p>
      <p className="zen-body-muted mt-2 max-w-2xl">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
