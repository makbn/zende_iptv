export type HealthTier =
  | "STABLE"
  | "FLAKY"
  | "UNSTABLE"
  | "DOWN"
  | "UNKNOWN";

/** Rolling window for success-rate calculation (days). */
export const HEALTH_WINDOW_DAYS = 7;

export function tierFromStats(successRate: number, sampleCount: number): HealthTier {
  if (sampleCount === 0) return "UNKNOWN";
  if (sampleCount >= 3 && successRate === 0) return "DOWN";
  if (successRate >= 0.85) return "STABLE";
  if (successRate >= 0.45) return "FLAKY";
  if (successRate > 0) return "UNSTABLE";
  return "DOWN";
}

export function tierLabel(tier: HealthTier): string {
  switch (tier) {
    case "STABLE":
      return "Stable";
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
