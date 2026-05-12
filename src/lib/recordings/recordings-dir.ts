import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Root for DVR MP4 files (and `.encoder.json` sidecars).
 *
 * In Docker, Compose sets `ZENDE_RECORDINGS_DIR=/data/recordings` so captures persist on
 * the same volume as SQLite (`zende-data` → `/data`). Without that, files would live under
 * `/app/data/recordings` and be lost on image rebuild.
 *
 * Local dev: defaults to `<cwd>/data/recordings`.
 */
function resolveRecordingsRoot(): string {
  const fromEnv = process.env.ZENDE_RECORDINGS_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), "data", "recordings");
}

const ROOT = resolveRecordingsRoot();

export function getRecordingsRoot(): string {
  return ROOT;
}

export async function ensureOwnerRecordingDir(ownerUserId: string): Promise<void> {
  await fs.mkdir(path.join(ROOT, ownerUserId), { recursive: true });
}

/**
 * `relativePath` is stored as `<ownerUserId>/<recordingId>.mp4`.
 * Verifies prefix so downloads cannot escape the tree.
 */
export function resolveStoredRecordingFile(
  ownerUserId: string,
  relativePath: string,
): string {
  const prefix = `${ownerUserId}${path.sep}`;
  if (!relativePath.startsWith(prefix)) {
    throw new Error("Invalid stored recording path.");
  }
  const joined = path.join(ROOT, relativePath);
  const root = path.resolve(ROOT);
  const resolved = path.resolve(joined);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid recording path resolution.");
  }
  return resolved;
}
