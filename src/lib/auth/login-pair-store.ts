import "server-only";

import { randomBytes } from "node:crypto";

const PAIR_TTL_MS = 10 * 60 * 1000;

export type LoginPairStatus = "pending" | "complete" | "expired";

export type LoginPairSession = {
  sessionId: string;
  status: LoginPairStatus;
  createdAt: number;
  expiresAt: number;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    username: string;
    role: string;
    isBootstrapAdmin: boolean;
  };
};

const sessions = new Map<string, LoginPairSession>();

function purgeExpired() {
  const now = Date.now();
  for (const [id, row] of sessions) {
    if (row.expiresAt <= now) sessions.delete(id);
  }
}

export function createLoginPairSession(): LoginPairSession {
  purgeExpired();
  const sessionId = randomBytes(16).toString("hex");
  const now = Date.now();
  const row: LoginPairSession = {
    sessionId,
    status: "pending",
    createdAt: now,
    expiresAt: now + PAIR_TTL_MS,
  };
  sessions.set(sessionId, row);
  return row;
}

export function getLoginPairSession(sessionId: string): LoginPairSession | null {
  purgeExpired();
  const row = sessions.get(sessionId);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return { ...row, status: "expired" };
  }
  return row;
}

export function completeLoginPairSession(
  sessionId: string,
  payload: {
    accessToken: string;
    refreshToken: string;
    user: LoginPairSession["user"];
  },
): boolean {
  const row = getLoginPairSession(sessionId);
  if (!row || row.status !== "pending") return false;
  sessions.set(sessionId, {
    ...row,
    status: "complete",
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  });
  return true;
}
