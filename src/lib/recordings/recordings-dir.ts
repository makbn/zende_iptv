import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "data", "recordings");

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
