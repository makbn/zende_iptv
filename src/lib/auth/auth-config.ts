import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function ensureAuthConfigRow(): Promise<{ enabled: boolean }> {
  const row = await prisma.authConfig.upsert({
    where: { id: 1 },
    create: { id: 1, enabled: false },
    update: {},
  });
  return { enabled: row.enabled };
}

export async function setAuthEnabled(enabled: boolean): Promise<void> {
  await prisma.authConfig.upsert({
    where: { id: 1 },
    create: { id: 1, enabled },
    update: { enabled },
  });
}
