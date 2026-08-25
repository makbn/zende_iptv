import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/core/logging/api-log";
import { createServerLogger } from "@/core/logging/server";
import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
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
import {
  clearAllChannelCatalog,
  getCatalogInventoryCounts,
} from "@/lib/library/clear-all-catalog";
import { loadManualChannelRows, saveManualChannelRows } from "@/lib/channels/manual-channels-db";
import { persistManualChannelsBatch } from "@/lib/channels/persist-manual-channels";
import { invalidateXtreamCatalogCache } from "@/lib/iptv/aggregated-channels";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const log = createServerLogger("api.channels.manual");

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
  contentType: z.enum(["live", "movie", "series"]).optional(),
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
const postSchema = z.object({
  channel: channelSchema.optional(),
  channels: z.array(channelSchema).max(250_000).optional(),
});
const patchSchema = z.object({
  id: z.string().min(1),
  channel: channelSchema,
});
const deleteSchema = z.object({
  id: z.string().min(1),
});
const deleteAllSchema = z.object({
  all: z.literal(true),
  confirm: z.literal("REMOVE_ALL_IMPORTED"),
});

function parseStoredRows(entriesJson: string): StoredManualChannelEntry[] {
  try {
    const raw = JSON.parse(entriesJson) as unknown;
    return parseManualEntriesLoose(raw);
  } catch {
    return [];
  }
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function loadExistingRows(): Promise<StoredManualChannelEntry[]> {
  return loadManualChannelRows();
}

async function saveRows(rows: StoredManualChannelEntry[]): Promise<void> {
  await saveManualChannelRows(rows);
}


/** GET persisted manual streams (Settings → manual URLs). */
export async function GET(request: Request) {
  return withApiLogging("api.channels.manual", request, async (routeLog) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const rows = await loadExistingRows();
    if (mode === "count") {
      const inventory = await getCatalogInventoryCounts();
      routeLog.info("inventory count", {
        manualTotal: inventory.manualTotal,
        catalogTotal: inventory.manualTotal + inventory.builtinChannelTotal,
      });
      return NextResponse.json({
      total: inventory.manualTotal,
      manualTotal: inventory.manualTotal,
      builtinChannelTotal: inventory.builtinChannelTotal,
      builtinPresetCount: inventory.builtinPresetCount,
      catalogTotal: inventory.manualTotal + inventory.builtinChannelTotal,
    });
  }
  if (mode === "list") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "150", 10) || 150));
    const filtered = q
      ? rows.filter((e) => {
          const ch = e.channel;
          return (
            ch.name.toLowerCase().includes(q) ||
            ch.url.toLowerCase().includes(q) ||
            (ch.groupTitle ?? "").toLowerCase().includes(q) ||
            (ch.tvgLanguage ?? "").toLowerCase().includes(q)
          );
        })
      : rows;
    const entries = filtered.slice(offset, offset + limit);
    routeLog.info("list page", { total: filtered.length, offset, limit });
    return NextResponse.json({ entries, total: filtered.length, offset, limit });
  }
  routeLog.info("full dump", { rows: rows.length });
  return NextResponse.json({ entries: rows });
  });
}

/** Add one or many manual channels server-side (no huge client payload bounce). */
export async function POST(request: Request) {
  return withApiLogging("api.channels.manual", request, async (routeLog) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;
    const forbidden = forbidCustomerSystemMutation(gate);
    if (forbidden) return forbidden;
    const g: ManualChannelsGate = gate.authEnabled
      ? { authEnabled: true, user: gate.user }
      : { authEnabled: false };
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
      routeLog.warn("post validation failed");
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const incoming = parsed.data.channels ?? (parsed.data.channel ? [parsed.data.channel] : []);
    if (incoming.length === 0) {
      return NextResponse.json({ error: "No channels provided." }, { status: 400 });
    }
    routeLog.info("post batch", { incoming: incoming.length });
    const { processed, skipped, total } = await persistManualChannelsBatch(incoming, g);
    return NextResponse.json({ ok: true, processed, skipped, total });
  });
}

export async function PATCH(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;
  const g: ManualChannelsGate = gate.authEnabled
    ? { authEnabled: true, user: gate.user }
    : { authEnabled: false };
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const rows = await loadExistingRows();
  const idx = rows.findIndex((r) => r.id === parsed.data.id);
  if (idx < 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = rows[idx]!;
  if (!canModifyManualChannelEntry(current, g)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const chNorm = normalizeManualChannel(parsed.data.channel);
  if (!chNorm.name || !isAllowedManualStreamUrl(chNorm.url)) {
    return NextResponse.json({ error: "Invalid channel name or stream URL" }, { status: 400 });
  }
  rows[idx] = { ...current, channel: chNorm };
  await saveRows(rows);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;
  const g: ManualChannelsGate = gate.authEnabled
    ? { authEnabled: true, user: gate.user }
    : { authEnabled: false };
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsedAll = deleteAllSchema.safeParse(json);
  if (parsedAll.success) {
    const isAdmin = gate.authEnabled && gate.user.role === "ADMIN";
    const canClearBuiltin = isAdmin || !gate.authEnabled;
    const result = await clearAllChannelCatalog({
      gate: g,
      clearBuiltinCatalog: canClearBuiltin,
    });
    log.info("delete all catalog", result);
    if (result.manualRemoved === 0 && result.builtinPresetsCleared === 0) {
      return NextResponse.json({ error: "Nothing to remove." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      removed: result.manualRemoved + result.builtinChannelsCleared,
      manualRemoved: result.manualRemoved,
      builtinChannelsCleared: result.builtinChannelsCleared,
      builtinPresetsCleared: result.builtinPresetsCleared,
      remaining: result.manualRemaining,
    });
  }

  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const rows = await loadExistingRows();
  const idx = rows.findIndex((r) => r.id === parsed.data.id);
  if (idx < 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModifyManualChannelEntry(rows[idx]!, g)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  rows.splice(idx, 1);
  await saveRows(rows);
  return NextResponse.json({ ok: true, removed: 1 });
}

/**
 * Replace manual streams list. Non-owners may only echo others' rows unchanged;
 * new rows get `addedByUserId` from the current session (or `__guest__` when auth is off).
 */
export async function PUT(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;

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
