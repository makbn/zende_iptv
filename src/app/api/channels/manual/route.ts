import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  canModifyManualChannelEntry,
  effectiveOwnerForNewManualEntry,
  manualChannelsEqual,
  normalizeManualChannel,
  parseManualEntriesLoose,
  type ManualChannelsGate,
  type StoredManualChannelEntry,
} from "@/lib/channels/manual-channels-policy";
import { isAllowedManualStreamUrl } from "@/lib/channels/manual-stream-url";
import { invalidateXtreamCatalogCache } from "@/lib/iptv/aggregated-channels";
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
  description: z.string().optional(),
});

const entrySchema = z.object({
  id: z.string().min(1),
  channel: channelSchema,
  addedAt: z.number(),
  addedByUserId: z.string().optional(),
});

const putSchema = z.object({
  entries: z.array(entrySchema).max(500),
});

function parseStoredRows(entriesJson: string): StoredManualChannelEntry[] {
  try {
    const raw = JSON.parse(entriesJson) as unknown;
    return parseManualEntriesLoose(raw);
  } catch {
    return [];
  }
}


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

/**
 * Replace manual streams list. Non-owners may only echo others' rows unchanged;
 * new rows get `addedByUserId` from the current session (or `__guest__` when auth is off).
 */
export async function PUT(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const g: ManualChannelsGate = gate.authEnabled
    ? { authEnabled: true, user: gate.user }
    : { authEnabled: false };

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

  const incoming = parsed.data.entries;
  const seen = new Set<string>();
  for (const row of incoming) {
    if (seen.has(row.id)) {
      return NextResponse.json({ error: "Duplicate entry id in payload" }, { status: 400 });
    }
    seen.add(row.id);
  }

  const row = await prisma.manualChannelsStore.findUnique({
    where: { id: MANUAL_STORE_ID },
  });
  const existing = row ? parseStoredRows(row.entriesJson) : [];
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const incomingIds = new Set(incoming.map((e) => e.id));

  for (const prev of existing) {
    if (!incomingIds.has(prev.id) && !canModifyManualChannelEntry(prev, g)) {
      return NextResponse.json(
        { error: "You cannot remove a channel added by another user." },
        { status: 403 },
      );
    }
  }

  const merged: StoredManualChannelEntry[] = [];

  for (const inc of incoming) {
    const chNorm = normalizeManualChannel(inc.channel);
    if (!chNorm.name || !isAllowedManualStreamUrl(chNorm.url)) {
      return NextResponse.json({ error: "Invalid channel name or stream URL" }, { status: 400 });
    }

    const prev = existingById.get(inc.id);
    if (prev) {
      if (!canModifyManualChannelEntry(prev, g)) {
        if (!manualChannelsEqual(prev.channel, chNorm)) {
          return NextResponse.json(
            { error: "You can only edit or remove channels you added (or ask an admin)." },
            { status: 403 },
          );
        }
        merged.push({ ...prev });
        continue;
      }

      merged.push({
        id: inc.id,
        channel: chNorm,
        addedAt: prev.addedAt,
        ...(prev.addedByUserId
          ? { addedByUserId: prev.addedByUserId }
          : { addedByUserId: effectiveOwnerForNewManualEntry(g) }),
      });
      continue;
    }

    merged.push({
      id: inc.id,
      channel: chNorm,
      addedAt: inc.addedAt,
      addedByUserId: effectiveOwnerForNewManualEntry(g),
    });
  }

  await prisma.manualChannelsStore.upsert({
    where: { id: MANUAL_STORE_ID },
    create: {
      id: MANUAL_STORE_ID,
      entriesJson: JSON.stringify(merged),
    },
    update: {
      entriesJson: JSON.stringify(merged),
    },
  });
  invalidateXtreamCatalogCache();

  return NextResponse.json({ ok: true, entries: merged });
}
