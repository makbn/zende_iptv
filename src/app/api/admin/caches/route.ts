import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CACHE_IDS,
  clearAdminCache,
  getAdminCacheSnapshots,
} from "@/lib/cache/cache-admin";
import { requireAdmin } from "@/lib/auth/gate-api";

export const runtime = "nodejs";

const deleteSchema = z.object({ cache: z.enum(CACHE_IDS) });

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  return NextResponse.json({ caches: await getAdminCacheSnapshots() });
}

export async function DELETE(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid cache to clear." }, { status: 400 });
  }
  await clearAdminCache(parsed.data.cache);
  return NextResponse.json({
    ok: true,
    cleared: parsed.data.cache,
    caches: await getAdminCacheSnapshots(),
  });
}

