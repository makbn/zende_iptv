"use client";

import type { HealthScoreDto } from "@/features/health/use-channel-health";
import { tierLabel, type HealthTier } from "@/lib/health/tier";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  STABLE: "bg-emerald-500/90 text-black shadow-emerald-500/30",
  MOODY: "bg-lime-400/95 text-black shadow-lime-400/25",
  FLAKY: "bg-amber-400/95 text-black shadow-amber-400/25",
  UNSTABLE: "bg-orange-500/90 text-white shadow-orange-500/30",
  DOWN: "bg-red-600/95 text-white shadow-red-600/35",
  UNKNOWN: "bg-white/15 text-white/70 ring-1 ring-white/20",
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
