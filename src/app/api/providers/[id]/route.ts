import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";

import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  serverUrl: z.string().trim().optional(),
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
  const nextServer = parsed.data.serverUrl === undefined ? previous.serverUrl : parsed.data.serverUrl || null;
  const nextUsername = parsed.data.username === undefined ? previous.username : parsed.data.username || null;
  const nextPassword = !parsed.data.password ? previous.password : parsed.data.password;
  const provider = await prisma.$transaction(async (tx) => {
    const updated = await tx.iptvProvider.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.serverUrl !== undefined ? { serverUrl: nextServer } : {}),
        ...(parsed.data.playlistUrl !== undefined ? { playlistUrl: parsed.data.playlistUrl || null } : {}),
        ...(parsed.data.username !== undefined ? { username: nextUsername } : {}),
        ...(parsed.data.password ? { password: parsed.data.password } : {}),
      },
    });
    if (previous.kind === "xtream" && nextServer && nextUsername && nextPassword &&
        (nextServer !== previous.serverUrl || nextUsername !== previous.username || nextPassword !== previous.password)) {
      const rows = await tx.iptvProviderChannel.findMany({ where: { providerId: id } });
      for (const row of rows) {
        let nextUrl = row.url;
        try {
          const current = new URL(row.url);
          const parts = current.pathname.split("/").filter(Boolean);
          if (["live", "movie", "series"].includes(parts[0] ?? "") && parts.length >= 4) {
            const server = new URL(/^https?:\/\//i.test(nextServer) ? nextServer : `http://${nextServer}`);
            parts[1] = encodeURIComponent(nextUsername);
            parts[2] = encodeURIComponent(nextPassword);
            server.pathname = `/${parts.join("/")}`;
            server.search = current.search;
            nextUrl = server.toString();
          }
        } catch { /* non-HTTP series containers remain unchanged */ }
        if (nextUrl !== row.url) {
          await tx.iptvProviderChannel.update({
            where: { id: row.id },
            data: {
              url: nextUrl,
              externalKey: createHash("sha256").update(nextUrl.trim()).digest("hex"),
            },
          });
        }
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
