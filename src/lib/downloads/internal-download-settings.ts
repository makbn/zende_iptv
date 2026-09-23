import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db/prisma";

function configuredRoots(): string[] {
  const fromEnv = process.env.ZENDE_INTERNAL_DOWNLOAD_ROOTS?.trim();
  const raw = fromEnv
    ? fromEnv.split(path.delimiter)
    : process.env.DATABASE_URL?.includes("/data/")
      ? ["/data"]
      : [path.join(process.cwd(), "data")];
  return [...new Set(raw.map((value) => value.trim()).filter(Boolean).map((value) => path.resolve(value)))];
}

export function internalDownloadRoots(): string[] {
  return configuredRoots();
}

function insideRoot(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export async function validateInternalDownloadDirectory(candidate: string): Promise<string> {
  const resolved = await fs.realpath(path.resolve(candidate.trim()));
  const roots = await Promise.all(
    configuredRoots().map(async (root) => fs.realpath(root).catch(() => path.resolve(root))),
  );
  if (!roots.some((root) => insideRoot(resolved, root))) {
    throw new Error("Select a directory inside an allowed server download root.");
  }
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error("The selected path is not a directory.");
  await fs.access(resolved, 2);
  return resolved;
}

export async function loadInternalDownloadSettings(): Promise<{
  configured: boolean;
  directoryPath: string | null;
}> {
  const row = await prisma.internalDownloadSettings.findUnique({ where: { id: 1 } });
  const directoryPath = row?.directoryPath?.trim() || null;
  if (!directoryPath) return { configured: false, directoryPath: null };
  try {
    return {
      configured: true,
      directoryPath: await validateInternalDownloadDirectory(directoryPath),
    };
  } catch {
    return { configured: false, directoryPath };
  }
}

export async function saveInternalDownloadDirectory(
  directoryPath: string | null,
): Promise<{ configured: boolean; directoryPath: string | null }> {
  const selected = directoryPath ? await validateInternalDownloadDirectory(directoryPath) : null;
  await prisma.internalDownloadSettings.upsert({
    where: { id: 1 },
    create: { id: 1, directoryPath: selected },
    update: { directoryPath: selected },
  });
  return { configured: Boolean(selected), directoryPath: selected };
}

export async function browseInternalDownloadDirectories(requested?: string | null) {
  const roots = configuredRoots();
  await Promise.all(roots.map((root) => fs.mkdir(root, { recursive: true })));
  const selected = await validateInternalDownloadDirectory(requested?.trim() || roots[0]!);
  const root = (await Promise.all(roots.map((value) => fs.realpath(value)))).find((value) => insideRoot(selected, value));
  if (!root) throw new Error("Directory is outside the allowed roots.");
  const entries = await fs.readdir(selected, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => ({ name: entry.name, path: path.join(selected, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    current: selected,
    parent: selected === root ? null : path.dirname(selected),
    roots,
    directories,
  };
}

export async function createInternalDownloadDirectory(parent: string, name: string) {
  if (!/^[^/\\\u0000-\u001f]{1,80}$/.test(name.trim()) || name.trim() === "." || name.trim() === "..") {
    throw new Error("Enter a valid folder name.");
  }
  const safeParent = await validateInternalDownloadDirectory(parent);
  const target = path.join(safeParent, name.trim());
  const roots = configuredRoots();
  if (!roots.some((root) => insideRoot(path.resolve(target), path.resolve(root)))) {
    throw new Error("Folder is outside the allowed roots.");
  }
  await fs.mkdir(target);
  return validateInternalDownloadDirectory(target);
}
