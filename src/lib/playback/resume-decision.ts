const STORAGE_KEY = "zende.playback.resumeDecision.v1";
const TTL_MS = 60_000;

export type ResumeDecision = {
  choice: "continue" | "start-over";
  positionSeconds?: number;
  /** Provider URL when known — used only for optional matching. */
  url?: string;
  expiresAt: number;
};

export function stashResumeDecision(
  decision: Omit<ResumeDecision, "expiresAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ResumeDecision = {
      ...decision,
      expiresAt: Date.now() + TTL_MS,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function consumeResumeDecision(): ResumeDecision | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeDecision;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt < Date.now()) {
      return null;
    }
    if (parsed.choice !== "continue" && parsed.choice !== "start-over") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
