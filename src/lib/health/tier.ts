export type HealthTier =
  | "STABLE"
  | "MOODY"
  | "FLAKY"
  | "UNSTABLE"
  | "DOWN"
  | "UNKNOWN";

/** Rolling window for success-rate calculation (days). */
export const HEALTH_WINDOW_DAYS = 7;

const TIER_RANK: Record<HealthTier, number> = {
  UNKNOWN: 0,
  DOWN: 1,
  UNSTABLE: 2,
  FLAKY: 3,
  MOODY: 4,
  STABLE: 5,
};

function higherTier(a: HealthTier, b: HealthTier): HealthTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/**
 * Tier from aggregate success rate in the rolling window (see thresholds below).
 * Boundaries: ≤3% unreachable, <10% unstable, <50% flaky, <75% moody, ≥75% stable.
 */
export function tierFromSuccessRate(successRate: number): HealthTier {
  if (successRate <= 0.03) return "DOWN";
  if (successRate < 0.1) return "UNSTABLE";
  if (successRate < 0.5) return "FLAKY";
  if (successRate < 0.75) return "MOODY";
  return "STABLE";
}

/**
 * If the last few probes all succeeded, the tier is at least that good — so a fixed stream
 * is not stuck "Unreachable" after many old failures once playback is healthy again.
 */
function recencyFloor(recentProbesNewestFirst: boolean[]): HealthTier | null {
  if (recentProbesNewestFirst.length >= 5) {
    const last5 = recentProbesNewestFirst.slice(0, 5);
    if (last5.every(Boolean)) return "STABLE";
  }
  if (recentProbesNewestFirst.length >= 3) {
    const last3 = recentProbesNewestFirst.slice(0, 3);
    if (last3.every(Boolean)) return "MOODY";
  }
  if (recentProbesNewestFirst.length >= 2) {
    const last2 = recentProbesNewestFirst.slice(0, 2);
    if (last2.every(Boolean)) return "FLAKY";
  }
  return null;
}

export function tierFromStats(
  successRate: number,
  sampleCount: number,
  recentProbesNewestFirst?: boolean[],
): HealthTier {
  if (sampleCount === 0) return "UNKNOWN";

  const base = tierFromSuccessRate(successRate);
  const floor = recentProbesNewestFirst?.length
    ? recencyFloor(recentProbesNewestFirst)
    : null;

  return floor ? higherTier(base, floor) : base;
}

export function tierLabel(tier: HealthTier): string {
  switch (tier) {
    case "STABLE":
      return "Stable";
    case "MOODY":
      return "Moody";
    case "FLAKY":
      return "Flaky";
    case "UNSTABLE":
      return "Unstable";
    case "DOWN":
      return "Unreachable";
    case "UNKNOWN":
      return "Unknown";
    default:
      return "Unknown";
  }
}
