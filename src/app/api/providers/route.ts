import { NextResponse } from "next/server";

import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const providers = await prisma.iptvProvider.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { channels: true } } },
  });
  return NextResponse.json({
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      serverUrl: provider.serverUrl,
      playlistUrl: provider.playlistUrl,
      username: provider.username,
      hasPassword: Boolean(provider.password),
      enabled: provider.enabled,
      channelCount: provider._count.channels,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    })),
  });
}

export async function DELETE(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Provider id required." }, { status: 400 });
  await prisma.iptvProvider.delete({ where: { id } });
  const { invalidateLibraryCatalogCache } = await import("@/lib/library/catalog");
  const { invalidateXtreamCatalogCache } = await import("@/lib/iptv/aggregated-channels");
  invalidateLibraryCatalogCache();
  invalidateXtreamCatalogCache();
  return NextResponse.json({ ok: true });
}
