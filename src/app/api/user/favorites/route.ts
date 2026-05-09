import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Sentinel userId used when auth is disabled (single-user / home mode). */
const GUEST_USER_ID = "__guest__";

async function resolveUserId(request: Request): Promise<string | Response> {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (gate.authEnabled) return gate.user.id;
  return GUEST_USER_ID;
}

export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (userId instanceof Response) return userId;

  const rows = await prisma.userFavorite.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
    select: {
      url: true,
      name: true,
      tvgId: true,
      tvgLogo: true,
      groupTitle: true,
      addedAt: true,
    },
  });

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (userId instanceof Response) return userId;

  let body: {
    url?: string;
    name?: string;
    tvgId?: string;
    tvgLogo?: string;
    groupTitle?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  await prisma.userFavorite.upsert({
    where: { userId_url: { userId, url: body.url } },
    create: {
      userId,
      url: body.url,
      name: (body.name ?? "").trim() || "Channel",
      tvgId: body.tvgId?.trim() ? body.tvgId.trim() : null,
      tvgLogo: body.tvgLogo ?? null,
      groupTitle: body.groupTitle ?? null,
    },
    update: {
      name: (body.name ?? "").trim() || "Channel",
      ...(body.tvgId !== undefined
        ? { tvgId: body.tvgId.trim() ? body.tvgId.trim() : null }
        : {}),
      tvgLogo: body.tvgLogo ?? null,
      groupTitle: body.groupTitle ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await resolveUserId(request);
  if (userId instanceof Response) return userId;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  await prisma.userFavorite.deleteMany({ where: { userId, url } });

  return NextResponse.json({ ok: true });
}
