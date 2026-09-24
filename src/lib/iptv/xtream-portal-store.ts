import "server-only";

import type { XtreamCredentials } from "@/lib/iptv/xtream-types";
import { activeXtreamServerUrl } from "@/lib/iptv/xtream-url";
import { prisma } from "@/lib/db/prisma";

export type ScopedXtreamCredentials = {
  providerId: string;
  providerName: string;
  credentials: XtreamCredentials;
};

function credentialsFromProvider(row: {
  serverUrl: string | null;
  backupServerUrl: string | null;
  useBackupServer: boolean;
  username: string | null;
  password: string | null;
}): XtreamCredentials | null {
  const serverUrl = activeXtreamServerUrl(row);
  const username = row.username?.trim() ?? "";
  const password = row.password?.trim() ?? "";
  if (!serverUrl || !username || !password) return null;
  return { serverUrl, username, password };
}

/** All enabled Xtream providers, scoped so EPG rows never bleed across providers. */
export async function loadEnabledXtreamProviderCredentials(): Promise<ScopedXtreamCredentials[]> {
  const rows = await prisma.iptvProvider.findMany({
    where: { kind: "xtream", enabled: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      serverUrl: true,
      backupServerUrl: true,
      useBackupServer: true,
      username: true,
      password: true,
    },
  });
  return rows.flatMap((row) => {
    const credentials = credentialsFromProvider(row);
    if (!credentials) return [];
    return [{
      providerId: row.id,
      providerName: row.name,
      credentials,
    }];
  });
}

/** Compatibility lookup for code paths without channel context. Provider rows are authoritative. */
export async function loadXtreamPortalCredentials(): Promise<XtreamCredentials | null> {
  const row = await prisma.iptvProvider.findFirst({
    where: { kind: "xtream", enabled: true },
    orderBy: { createdAt: "asc" },
    select: {
      serverUrl: true,
      backupServerUrl: true,
      useBackupServer: true,
      username: true,
      password: true,
    },
  });
  if (!row) return null;
  return credentialsFromProvider(row);
}

export async function clearXtreamPortalCredentials(): Promise<void> {
  await prisma.iptvProvider.updateMany({
    where: { kind: "xtream" },
    data: { enabled: false },
  });
}
