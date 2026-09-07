import "server-only";

import { randomBytes } from "node:crypto";
import type {
  RemoteCommand,
  RemoteCommandInput,
  RemotePlaybackState,
} from "@/lib/remote/remote-control-types";

export type RemoteTvSession = {
  sessionId: string;
  userId: string;
  label: string;
  kind: "tv" | "desktop" | "other";
  pathname: string;
  playback: RemotePlaybackState | null;
  createdAt: number;
  lastSeenAt: number;
  commandSeq: number;
  commands: RemoteCommand[];
};

const SESSION_TTL_MS = 45_000;
const COMMAND_TTL_MS = 2 * 60_000;

// Next route handlers are emitted as separate server bundles. Keep the live
// remote registry on the process global so session registration, command
// enqueueing, and TV polling all see the same Map in the single Docker process.
const remoteGlobal = globalThis as typeof globalThis & {
  __zendeRemoteTvSessions?: Map<string, RemoteTvSession>;
};
const sessions =
  remoteGlobal.__zendeRemoteTvSessions ??
  (remoteGlobal.__zendeRemoteTvSessions = new Map<string, RemoteTvSession>());

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
  kind?: "tv" | "desktop" | "other" | null;
  pathname?: string | null;
  playback?: RemotePlaybackState | null;
}): RemoteTvSession {
  purge();
  const existing = input.sessionId ? sessions.get(input.sessionId) : null;
  if (existing && existing.userId === input.userId) {
    existing.lastSeenAt = now();
    if (input.label?.trim()) existing.label = input.label.trim();
    if (input.kind) existing.kind = input.kind;
    if (input.pathname?.trim()) existing.pathname = input.pathname.trim();
    if (input.playback !== undefined) existing.playback = input.playback;
    return existing;
  }

  const sessionId = randomBytes(16).toString("hex");
  const session: RemoteTvSession = {
    sessionId,
    userId: input.userId,
    label: input.label?.trim() || "TV browser",
    kind: input.kind ?? "other",
    pathname: input.pathname?.trim() || "/",
    playback: input.playback ?? null,
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
  command: RemoteCommandInput,
): RemoteCommand | null {
  const session = getRemoteTvSession(sessionId, userId);
  if (!session) return null;
  session.commandSeq += 1;
  const queued = {
    ...command,
    id: randomBytes(12).toString("hex"),
    seq: session.commandSeq,
    createdAt: now(),
  } as RemoteCommand;
  session.commands.push(queued);
  session.lastSeenAt = now();
  return queued;
}

/**
 * Deliver commands at most once, stopping the batch at the first command that
 * changes routes. Older TV clients use a full document navigation and lose
 * their in-memory cursor; draining the delivered prefix prevents that command
 * from replaying forever after the reload. Commands queued after the route
 * change remain available to the next page.
 */
export function dequeueRemoteCommands(
  sessionId: string,
  userId: string,
  after: number,
): { commandSeq: number; commands: RemoteCommand[] } | null {
  const session = getRemoteTvSession(sessionId, userId);
  if (!session) return null;

  const pending = session.commands.filter((command) => command.seq > after);
  const routeChangeIndex = pending.findIndex(
    (command) => command.type === "navigate" || command.type === "playMedia",
  );
  const commands = routeChangeIndex >= 0
    ? pending.slice(0, routeChangeIndex + 1)
    : pending;

  if (commands.length > 0) {
    const delivered = new Set(commands.map((command) => command.id));
    session.commands = session.commands.filter(
      (command) => !delivered.has(command.id),
    );
  }

  return { commandSeq: session.commandSeq, commands };
}
