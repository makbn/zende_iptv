import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(4).max(8192),
  positionSeconds: z.number().finite().min(0).max(86400 * 12),
});

const GUEST_USER_ID = "__guest__";

async function resolveUserId(request: Request): Promise<string | Response> {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (gate.authEnabled) return gate.user.id;
  return GUEST_USER_ID;
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (userId instanceof Response) return userId;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const position = Math.round(parsed.data.positionSeconds);
  await prisma.userViewingHistory.updateMany({
    where: { userId, url: parsed.data.url },
    data: { positionSeconds: position },
  });

  return NextResponse.json({ ok: true, stored: true });
}
