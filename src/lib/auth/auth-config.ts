import "server-only";

import { prisma } from "@/lib/db/prisma";

const AUTH_CONFIG_CACHE_TTL_MS = 5_000;

let cachedConfig: { enabled: boolean; expiresAt: number } | null = null;
let pendingConfig: Promise<{ enabled: boolean }> | null = null;

async function readOrCreateAuthConfig(): Promise<{ enabled: boolean }> {
  const existing = await prisma.authConfig.findUnique({
    where: { id: 1 },
    select: { enabled: true },
  });
  if (existing) return existing;

  // This is the only write needed during bootstrap. Normal authenticated API
  // requests must remain read-only here; upserting on every request serialized
  // SQLite writers and eventually surfaced as Prisma P1008 socket timeouts.
  try {
    return await prisma.authConfig.create({
      data: { id: 1, enabled: false },
      select: { enabled: true },
    });
  } catch {
    // Another request/process may have created the singleton concurrently.
    const raced = await prisma.authConfig.findUnique({
      where: { id: 1 },
      select: { enabled: true },
    });
    if (raced) return raced;
    throw new Error("Failed to initialize authentication configuration.");
  }
}

export async function ensureAuthConfigRow(): Promise<{ enabled: boolean }> {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) {
    return { enabled: cachedConfig.enabled };
  }
  if (pendingConfig) return pendingConfig;

  pendingConfig = readOrCreateAuthConfig()
    .then((config) => {
      cachedConfig = {
        enabled: config.enabled,
        expiresAt: Date.now() + AUTH_CONFIG_CACHE_TTL_MS,
      };
      return { enabled: config.enabled };
    })
    .finally(() => {
      pendingConfig = null;
    });
  return pendingConfig;
}

export async function setAuthEnabled(enabled: boolean): Promise<void> {
  await prisma.authConfig.upsert({
    where: { id: 1 },
    create: { id: 1, enabled },
    update: { enabled },
  });
  cachedConfig = {
    enabled,
    expiresAt: Date.now() + AUTH_CONFIG_CACHE_TTL_MS,
  };
}
