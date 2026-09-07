export type StoredRemoteCommandCursor = {
  sessionId: string;
  seq: number;
};

export function parseRemoteCommandCursor(
  raw: string | null,
  sessionId: string | null,
): number {
  if (!raw || !sessionId) return 0;
  try {
    const value = JSON.parse(raw) as Partial<StoredRemoteCommandCursor>;
    if (value.sessionId !== sessionId) return 0;
    if (!Number.isSafeInteger(value.seq) || (value.seq ?? -1) < 0) return 0;
    return value.seq!;
  } catch {
    return 0;
  }
}

export function serializeRemoteCommandCursor(
  sessionId: string,
  seq: number,
): string {
  return JSON.stringify({
    sessionId,
    seq: Number.isSafeInteger(seq) && seq >= 0 ? seq : 0,
  } satisfies StoredRemoteCommandCursor);
}
