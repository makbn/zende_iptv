import type { ReactNode } from "react";

import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CinematicPageProps = {
  children: ReactNode;
  className?: string;
  id?: string;
};

export function CinematicPage({
  children,
  className,
  id = "main",
}: CinematicPageProps) {
  return (
    <main
      id={id}
      tabIndex={-1}
      className={cn(
        "zen-page-bg relative min-h-screen overflow-hidden text-white outline-none",
        className,
      )}
    >
      <div className="zen-signal-beams" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(ellipse_at_50%_0%,rgba(56,217,255,0.14),transparent_62%)]"
        aria-hidden
      />
      <div className="relative z-10">{children}</div>
    </main>
  );
}

type CinematicHeroProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function CinematicHero({
  eyebrow,
  title,
  description,
  children,
  aside,
  className,
}: CinematicHeroProps) {
  return (
    <section
      className={cn(
        BROWSE_CONTAINER_CLASS,
        "relative grid gap-4 pb-4 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,34rem)] lg:items-end",
        className,
      )}
    >
      <div className="motion-safe:animate-zen-cinema-in min-w-0">
        <p className="zen-kicker">{eyebrow}</p>
        <h1 className="mt-2 max-w-[18ch] text-[clamp(1.9rem,3.4vw,3.8rem)] font-semibold leading-[0.92] tracking-[-0.07em] text-white">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-pretty text-[14px] leading-relaxed text-white/56 sm:text-[15px]">
          {description}
        </p>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
      {aside ? (
        <div className="motion-safe:animate-zen-cinema-in">
          {aside}
        </div>
      ) : null}
    </section>
  );
}

type CinematicMetric = {
  label: string;
  value: ReactNode;
  tone?: "signal" | "ember" | "neutral";
};

export function CinematicMetrics({
  metrics,
  className,
}: {
  metrics: CinematicMetric[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2 sm:grid-cols-3",
        className,
      )}
    >
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={cn(
            "rounded-[18px] border border-white/[0.1] bg-white/[0.055] p-3 shadow-[0_14px_44px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl",
            metric.tone === "signal" && "border-cyan-200/20 bg-cyan-300/[0.07]",
            metric.tone === "ember" && "border-orange-200/20 bg-orange-300/[0.07]",
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
            {metric.label}
          </p>
          <p className="mt-1 text-[20px] font-semibold tracking-[-0.055em] text-white">
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function CinematicCommandPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] border border-white/[0.12] bg-black/42 p-3 shadow-[0_22px_70px_-42px_rgba(0,0,0,0.95)] backdrop-blur-2xl ring-1 ring-white/[0.06] sm:p-4",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[var(--zen-signal)]/12 blur-3xl"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function CinematicActionRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {children}
    </div>
  );
}

export function CinematicButton({
  children,
  variant = "normal",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "normal" | "success" | "danger";
}) {
  return (
    <Button
      variant={variant}
      size="lg"
      className={cn("motion-safe:active:scale-[0.98]", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

export function CinematicSection({
  id,
  eyebrow,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(BROWSE_CONTAINER_CLASS, className)}
    >
      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow ? <p className="zen-kicker">{eyebrow}</p> : null}
          <h2 className="mt-1 text-[clamp(1.35rem,2.4vw,2.15rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-white">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-white/50 sm:text-[14px]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function CinematicRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
            "tv-row-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
