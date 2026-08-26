import type { ReactNode } from "react";

import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import { Button } from "@appica/ui-react/button";
import { Card } from "@appica/ui-react/card";
import { cn } from "@/lib/utils";

type AppicaPageProps = {
  children: ReactNode;
  className?: string;
  id?: string;
};

export function AppicaPage({
  children,
  className,
  id = "main",
}: AppicaPageProps) {
  return (
    <main
      id={id}
      tabIndex={-1}
      className={cn(
        "relative min-h-screen bg-background-subtle text-foreground-intense outline-none",
        className,
      )}
    >
      
      {children}
    </main>
  );
}

type AppicaHeroProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function AppicaHero({
  eyebrow,
  title,
  description,
  children,
  aside,
  className,
}: AppicaHeroProps) {
  return (
    <section
      className={cn(
        BROWSE_CONTAINER_CLASS,
        "grid gap-6 border-b border-border py-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,30rem)] lg:items-end",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground-muted">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-foreground-intense sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-base leading-relaxed text-foreground-muted">
          {description}
        </p>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
      {aside ? (
        <div className="">
          {aside}
        </div>
      ) : null}
    </section>
  );
}

type AppicaMetric = {
  label: string;
  value: ReactNode;
  tone?: "signal" | "ember" | "neutral";
};

export function AppicaMetrics({
  metrics,
  className,
}: {
  metrics: AppicaMetric[];
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
        <Card
          frame="solid"
          inset={false}
          key={metric.label}
          className={cn(metric.tone === "signal" && "text-primary", metric.tone === "ember" && "text-warning")}
          contentProps={{ className: "p-4" }}
        >
          <p className="text-sm text-foreground-muted">
            {metric.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground-intense">
            {metric.value}
          </p>
        </Card>
      ))}
    </div>
  );
}

export function AppicaPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      frame="solid"
      inset={false}
      className={className}
      contentProps={{ className: "p-4 sm:p-6" }}
    >
      {children}
    </Card>
  );
}

export function AppicaActionRow({
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

export function AppicaButton({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "destructive";
}) {
  return (
    <Button
      variant={variant}
      size="md"
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
}

export function AppicaSection({
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
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow ? <p className="text-sm font-medium text-foreground-muted">{eyebrow}</p> : null}
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground-intense sm:text-2xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-foreground-muted">
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

export function AppicaRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
            "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
