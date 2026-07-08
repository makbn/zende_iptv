import "server-only";

import { randomBytes } from "node:crypto";

export type RemoteCommand =
  | {
      id: string;
      type: "navigate";
      payload: { href: string };
      createdAt: number;
    }
  | {
      id: string;
      type: "togglePlay" | "play" | "pause";
      payload?: Record<string, never>;
      createdAt: number;
    }
  | {
      id: string;
      type: "skip";
      payload: { seconds: number };
      createdAt: number;
    }
  | {
      id: string;
      type: "seekTo";
      payload: { seconds: number };
      createdAt: number;
    };

export type RemoteTvSession = {
  sessionId: string;
  userId: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  commandSeq: number;
  commands: RemoteCommand[];
};

const SESSION_TTL_MS = 45_000;
const COMMAND_TTL_MS = 2 * 60_000;
const sessions = new Map<string, RemoteTvSession>();

function now() {
  return Date.now();
}

function purge() {
  const cutoff = now() - SESSION_TTL_MS;
  const commandCutoff = now() - COMMAND_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.lastSeenAt < cutoff) {
      sessions.delete(id);
      continue;
    }
    session.commands = session.commands.filter(
      (command) => command.createdAt >= commandCutoff,
    );
  }
}

export function upsertRemoteTvSession(input: {
  sessionId?: string | null;
  userId: string;
  label?: string | null;
}): RemoteTvSession {
  purge();
  const existing = input.sessionId ? sessions.get(input.sessionId) : null;
  if (existing && existing.userId === input.userId) {
    existing.lastSeenAt = now();
    if (input.label?.trim()) existing.label = input.label.trim();
    return existing;
  }

  const sessionId = randomBytes(16).toString("hex");
  const session: RemoteTvSession = {
    sessionId,
    userId: input.userId,
    label: input.label?.trim() || "TV browser",
    createdAt: now(),
    lastSeenAt: now(),
    commandSeq: 0,
    commands: [],
  };
  sessions.set(sessionId, session);
  return session;
}

export function listRemoteTvSessions(userId: string): RemoteTvSession[] {
  purge();
  return [...sessions.values()]
    .filter((session) => session.userId === userId)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function getRemoteTvSession(
  sessionId: string,
  userId: string,
): RemoteTvSession | null {
  purge();
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return null;
  return session;
}

export function enqueueRemoteCommand(
  sessionId: string,
  userId: string,
  command: Omit<RemoteCommand, "id" | "createdAt">,
): RemoteCommand | null {
  const session = getRemoteTvSession(sessionId, userId);
  if (!session) return null;
  const queued = {
    ...command,
    id: randomBytes(12).toString("hex"),
    createdAt: now(),
  } as RemoteCommand;
  session.commandSeq += 1;
  session.commands.push(queued);
  session.lastSeenAt = now();
  return queued;
}
