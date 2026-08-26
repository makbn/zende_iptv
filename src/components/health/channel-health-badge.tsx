"use client";

import type { HealthScoreDto } from "@/features/health/use-channel-health";
import { tierLabel, type HealthTier } from "@/lib/health/tier";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  STABLE: "bg-success-subtle text-foreground-inverse shadow-sm",
  MOODY: "bg-success-subtle text-foreground-inverse shadow-sm",
  FLAKY: "bg-warning-subtle text-foreground-inverse shadow-sm",
  UNSTABLE: "bg-warning-subtle text-foreground-intense shadow-sm",
  DOWN: "bg-error-subtle text-foreground-intense shadow-sm",
  UNKNOWN: "bg-background-muted text-foreground-intense ring-1 ring-border",
};

export function ChannelHealthBadge({
  score,
  className,
}: {
  score?: HealthScoreDto;
  className?: string;
}) {
  const tier = (score?.tier ?? "UNKNOWN") as HealthTier;
  if (tier === "UNKNOWN") return null;

  const label = tierLabel(tier);
  const detail =
    score && score.sampleCount > 0
      ? `${Math.round(score.successRate * 100)}% · n=${score.sampleCount}`
      : "Not measured yet";

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none shadow-sm",
        styles[tier] ?? styles.UNKNOWN,
        className,
      )}
      title={detail}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
