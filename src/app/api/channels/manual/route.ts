import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const MANUAL_STORE_ID = 1;

const channelSchema = z.object({
  name: z.string(),
  url: z.string(),
  duration: z.number(),
  tvgId: z.string().optional(),
  tvgLogo: z.string().optional(),
  tvgLanguage: z.string().optional(),
  groupTitle: z.string().optional(),
});

const entrySchema = z.object({
  id: z.string(),
  channel: channelSchema,
  addedAt: z.number(),
});

const putSchema = z.object({
  entries: z.array(entrySchema).max(500),
});

/** GET persisted manual streams (Settings → manual URLs). */
export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const row = await prisma.manualChannelsStore.findUnique({
    where: { id: MANUAL_STORE_ID },
  });
  if (!row) {
    return NextResponse.json({ entries: [] });
  }

  try {
    const parsed = JSON.parse(row.entriesJson) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [];
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

/** Replace manual streams list (small payload — full list on each edit). */
export async function PUT(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.manualChannelsStore.upsert({
    where: { id: MANUAL_STORE_ID },
    create: {
      id: MANUAL_STORE_ID,
      entriesJson: JSON.stringify(parsed.data.entries),
    },
    update: {
      entriesJson: JSON.stringify(parsed.data.entries),
    },
  });

  return NextResponse.json({ ok: true });
}
