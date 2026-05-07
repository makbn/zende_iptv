import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const GUEST_USER_ID = "__guest__";
const MAX_HISTORY = 200;

async function resolveUserId(request: Request): Promise<string | Response> {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (gate.authEnabled) return gate.user.id;
  return GUEST_USER_ID;
}

export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (userId instanceof Response) return userId;

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") ?? "recent";

  const rows = await prisma.userViewingHistory.findMany({
    where: { userId },
    orderBy:
      sort === "count"
        ? [{ openCount: "desc" }, { lastOpenedAt: "desc" }]
        : { lastOpenedAt: "desc" },
    take: MAX_HISTORY,
    select: {
      url: true,
      name: true,
      tvgLogo: true,
      groupTitle: true,
      lastOpenedAt: true,
      openCount: true,
    },
  });

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (userId instanceof Response) return userId;

  let body: { url?: string; name?: string; tvgLogo?: string; groupTitle?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  await prisma.userViewingHistory.upsert({
    where: { userId_url: { userId, url: body.url } },
    create: {
      userId,
      url: body.url,
      name: (body.name ?? "").trim() || "Live",
      tvgLogo: body.tvgLogo ?? null,
      groupTitle: body.groupTitle ?? null,
      openCount: 1,
      lastOpenedAt: new Date(),
    },
    update: {
      name: (body.name ?? "").trim() || "Live",
      tvgLogo: body.tvgLogo ?? null,
      groupTitle: body.groupTitle ?? null,
      openCount: { increment: 1 },
      lastOpenedAt: new Date(),
    },
  });

  // Prune oldest entries beyond MAX_HISTORY
  const oldest = await prisma.userViewingHistory.findMany({
    where: { userId },
    orderBy: { lastOpenedAt: "asc" },
    skip: MAX_HISTORY,
    select: { id: true },
  });
  if (oldest.length > 0) {
    await prisma.userViewingHistory.deleteMany({
      where: { id: { in: oldest.map((r) => r.id) } },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await resolveUserId(request);
  if (userId instanceof Response) return userId;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  await prisma.userViewingHistory.deleteMany({ where: { userId, url } });

  return NextResponse.json({ ok: true });
}
