import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";

import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  url: z.string().url().optional(),
  groupTitle: z.string().optional(),
  tvgId: z.string().optional(),
  tvgLogo: z.string().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string; channelId: string }> }) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid channel update." }, { status: 400 });
  const { id, channelId } = await context.params;
  const data = parsed.data.url
    ? {
        ...parsed.data,
        externalKey: createHash("sha256").update(parsed.data.url.trim()).digest("hex"),
      }
    : parsed.data;
  const result = await prisma.iptvProviderChannel.updateMany({
    where: { id: channelId, providerId: id },
    data,
  });
  if (!result.count) return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  const { invalidateLibraryCatalogCache } = await import("@/lib/library/catalog");
  const { invalidateXtreamCatalogCache } = await import("@/lib/iptv/aggregated-channels");
  invalidateLibraryCatalogCache();
  invalidateXtreamCatalogCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; channelId: string }> }) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;
  const { id, channelId } = await context.params;
  await prisma.iptvProviderChannel.deleteMany({ where: { id: channelId, providerId: id } });
  const { invalidateLibraryCatalogCache } = await import("@/lib/library/catalog");
  const { invalidateXtreamCatalogCache } = await import("@/lib/iptv/aggregated-channels");
  invalidateLibraryCatalogCache();
  invalidateXtreamCatalogCache();
  return NextResponse.json({ ok: true });
}
