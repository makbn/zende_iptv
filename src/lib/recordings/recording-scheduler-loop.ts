import "server-only";

import { tickRecordingScheduler } from "./recording-service";

let timer: NodeJS.Timeout | undefined;

/**
 * Starts a lightweight interval on the Node server to dispatch due schedules.
 * Safe for single-process self-hosted deployments; no-op duplicate starts.
 */
export function ensureRecordingSchedulerStarted(): void {
  if (timer !== undefined) return;
  void tickRecordingScheduler().catch(() => {});
  timer = setInterval(() => {
    void tickRecordingScheduler().catch(() => {});
  }, 12_000);
  if (typeof timer.unref === "function") timer.unref();
}
