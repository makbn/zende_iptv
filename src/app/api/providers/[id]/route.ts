import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";

import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";
import { toXtreamStoragePath, xtreamPathSegments } from "@/lib/iptv/xtream-url";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  serverUrl: z.string().trim().optional(),
  backupServerUrl: z.string().trim().optional(),
  useBackupServer: z.boolean().optional(),
  playlistUrl: z.string().trim().optional(),
  username: z.string().trim().optional(),
  password: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid provider update." }, { status: 400 });
  const { id } = await context.params;
  const previous = await prisma.iptvProvider.findUnique({ where: { id } });
  if (!previous) return NextResponse.json({ error: "Provider not found." }, { status: 404 });

  const nextServer =
    parsed.data.serverUrl === undefined ? previous.serverUrl : parsed.data.serverUrl || null;
  const nextBackup =
    parsed.data.backupServerUrl === undefined
      ? previous.backupServerUrl
      : parsed.data.backupServerUrl || null;
  const nextUseBackup =
    parsed.data.useBackupServer === undefined
      ? previous.useBackupServer
      : parsed.data.useBackupServer;
  const nextUsername =
    parsed.data.username === undefined ? previous.username : parsed.data.username || null;
  const nextPassword = !parsed.data.password ? previous.password : parsed.data.password;

  if (nextUseBackup && !nextBackup?.trim()) {
    return NextResponse.json(
      { error: "Add a backup server URL before switching to it." },
      { status: 400 },
    );
  }

  const provider = await prisma.$transaction(async (tx) => {
    const updated = await tx.iptvProvider.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.serverUrl !== undefined ? { serverUrl: nextServer } : {}),
        ...(parsed.data.backupServerUrl !== undefined
          ? { backupServerUrl: nextBackup }
          : {}),
        ...(parsed.data.useBackupServer !== undefined
          ? { useBackupServer: nextUseBackup }
          : {}),
        ...(parsed.data.playlistUrl !== undefined
          ? { playlistUrl: parsed.data.playlistUrl || null }
          : {}),
        ...(parsed.data.username !== undefined ? { username: nextUsername } : {}),
        ...(parsed.data.password ? { password: parsed.data.password } : {}),
      },
    });

    // Host changes do not rewrite the catalog — streams are stored as host-free
    // paths. Only username/password changes rewrite path credentials.
    const credsChanged =
      previous.kind === "xtream" &&
      nextUsername &&
      nextPassword &&
      (nextUsername !== previous.username || nextPassword !== previous.password);
    if (credsChanged) {
      const rows = await tx.iptvProviderChannel.findMany({ where: { providerId: id } });
      for (const row of rows) {
        const parts = xtreamPathSegments(row.url);
        if (!parts) continue;
        parts[1] = encodeURIComponent(nextUsername);
        parts[2] = encodeURIComponent(nextPassword);
        const nextUrl = `/${parts.join("/")}`;
        if (nextUrl === toXtreamStoragePath(row.url)) continue;
        await tx.iptvProviderChannel.update({
          where: { id: row.id },
          data: {
            url: nextUrl,
            externalKey: createHash("sha256").update(nextUrl.trim()).digest("hex"),
          },
        });
      }
    }
    return updated;
  });

  const { invalidateLibraryCatalogCache } = await import("@/lib/library/catalog");
  const { invalidateXtreamCatalogCache } = await import("@/lib/iptv/aggregated-channels");
  invalidateLibraryCatalogCache();
  invalidateXtreamCatalogCache();
  return NextResponse.json({ ok: true, id: provider.id });
}
