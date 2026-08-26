import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(250, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const channels = await prisma.iptvProviderChannel.findMany({
    where: {
      providerId: id,
      ...(q ? { OR: [{ name: { contains: q } }, { groupTitle: { contains: q } }, { url: { contains: q } }] } : {}),
    },
    orderBy: { name: "asc" },
    take: limit,
  });
  const total = await prisma.iptvProviderChannel.count({ where: { providerId: id } });
  return NextResponse.json({ channels, total });
}
