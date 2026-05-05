import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";
import { assertCronAuthorized } from "@/lib/health/cron-auth";
import { syncBodySchema } from "@/lib/health/sync-schema";
import { hashStreamUrl } from "@/lib/health/url-hash";

export const runtime = "nodejs";
export const maxDuration = 120;

const log = createServerLogger("api.channelRegistry.sync");

export async function POST(request: Request) {
  const cfg = await ensureAuthConfigRow();
  if (cfg.enabled) {
    const g = await gateApiRequest(request);
    if ("response" in g) return g.response;
  } else {
    const denied = assertCronAuthorized(request);
    if (denied) return denied;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { entries } = parsed.data;
  let upserted = 0;

  for (const e of entries) {
    const urlHash = await hashStreamUrl(e.url);
    await prisma.channelRegistryEntry.upsert({
      where: { urlHash },
      create: {
        urlHash,
        url: e.url.trim(),
        label: e.label,
        presetId: e.presetId,
      },
      update: {
        url: e.url.trim(),
        label: e.label ?? undefined,
        presetId: e.presetId ?? undefined,
      },
    });
    upserted++;
  }

  log.info("Registry sync", { upserted });

  return NextResponse.json({ ok: true, upserted });
}
