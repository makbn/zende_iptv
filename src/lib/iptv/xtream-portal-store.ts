import "server-only";

import type { XtreamCredentials } from "@/lib/iptv/xtream-types";
import { prisma } from "@/lib/db/prisma";

/** Compatibility lookup for code paths without channel context. Provider rows are authoritative. */
export async function loadXtreamPortalCredentials(): Promise<XtreamCredentials | null> {
  const row = await prisma.iptvProvider.findFirst({
    where: { kind: "xtream", enabled: true },
    orderBy: { createdAt: "asc" },
    select: { serverUrl: true, username: true, password: true },
  });
  if (!row) return null;
  const serverUrl = row.serverUrl?.trim() ?? "";
  const username = row.username?.trim() ?? "";
  const password = row.password?.trim() ?? "";
  if (!serverUrl || !username || !password) return null;
  return { serverUrl, username, password };
}

export async function clearXtreamPortalCredentials(): Promise<void> {
  await prisma.iptvProvider.updateMany({
    where: { kind: "xtream" },
    data: { enabled: false },
  });
}
