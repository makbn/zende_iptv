import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { createServerLogger } from "@/core/logging/server";
import { ensureAuthConfigRow } from "@/lib/auth/auth-config";
import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
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
    const forbidden = forbidCustomerSystemMutation(g);
    if (forbidden) return forbidden;
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

  /** Same URL twice in one payload → duplicate PK in a single INSERT → SQLite UNIQUE error. */
  const deduped = new Map<
    string,
    { urlHash: string; url: string; label: string | null; presetId: string | null }
  >();
  for (const r of rows) {
    deduped.set(r.urlHash, r);
  }
  const uniqueRows = [...deduped.values()];

  let upserted = 0;
  try {
    for (let i = 0; i < uniqueRows.length; i += REGISTRY_UPSERT_CHUNK) {
      const chunk = uniqueRows.slice(i, i + REGISTRY_UPSERT_CHUNK);
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
  } catch (e) {
    log.error("Registry sync failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Registry sync failed." }, { status: 500 });
  }

  log.info("Registry sync", { upserted });

  return NextResponse.json({ ok: true, upserted });
}
