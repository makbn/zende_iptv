import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { createServerLogger } from "@/core/logging/server";
import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";
import { assertCronAuthorized } from "@/lib/health/cron-auth";
import { syncBodySchema } from "@/lib/health/sync-schema";
import { hashStreamUrl } from "@/lib/health/url-hash";

/** SQLite bind parameter limit (~999): 6 columns per row leaves ~160 rows safe per statement. */
const REGISTRY_UPSERT_CHUNK = 160;

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

  const rows = await Promise.all(
    entries.map(async (e) => ({
      urlHash: await hashStreamUrl(e.url),
      url: e.url.trim(),
      label: e.label ?? null,
      presetId: e.presetId ?? null,
    })),
  );

  let upserted = 0;
  for (let i = 0; i < rows.length; i += REGISTRY_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + REGISTRY_UPSERT_CHUNK);
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "ChannelRegistryEntry" ("urlHash", "url", "label", "presetId", "createdAt", "updatedAt")
      VALUES ${Prisma.join(
        chunk.map(
          (r) =>
            Prisma.sql`(${r.urlHash}, ${r.url}, ${r.label}, ${r.presetId}, ${now}, ${now})`,
        ),
      )}
      ON CONFLICT ("urlHash") DO UPDATE SET
        "url" = excluded."url",
        "label" = excluded."label",
        "presetId" = excluded."presetId",
        "updatedAt" = excluded."updatedAt"
    `;
    upserted += chunk.length;
  }

  log.info("Registry sync", { upserted });

  return NextResponse.json({ ok: true, upserted });
}
