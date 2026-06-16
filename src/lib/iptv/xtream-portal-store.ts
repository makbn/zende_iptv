import "server-only";

import type { XtreamCredentials } from "@/lib/iptv/xtream-types";
import { prisma } from "@/lib/db/prisma";

const PORTAL_ROW_ID = 1;

export async function saveXtreamPortalCredentials(creds: XtreamCredentials): Promise<void> {
  await prisma.xtreamPortalConfig.upsert({
    where: { id: PORTAL_ROW_ID },
    create: {
      id: PORTAL_ROW_ID,
      serverUrl: creds.serverUrl,
      username: creds.username,
      password: creds.password,
    },
    update: {
      serverUrl: creds.serverUrl,
      username: creds.username,
      password: creds.password,
    },
  });
}

export async function loadXtreamPortalCredentials(): Promise<XtreamCredentials | null> {
  const row = await prisma.xtreamPortalConfig.findUnique({ where: { id: PORTAL_ROW_ID } });
  if (!row) return null;
  const serverUrl = row.serverUrl.trim();
  const username = row.username.trim();
  const password = row.password.trim();
  if (!serverUrl || !username || !password) return null;
  return { serverUrl, username, password };
}

export async function clearXtreamPortalCredentials(): Promise<void> {
  await prisma.xtreamPortalConfig.deleteMany({ where: { id: PORTAL_ROW_ID } });
}
