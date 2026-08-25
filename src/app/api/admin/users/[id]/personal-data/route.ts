import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";
import { invalidateThreadfinCatalogCache } from "@/lib/threadfin/catalog";
import { scheduleThreadfinSync } from "@/lib/threadfin/sync";

export const runtime = "nodejs";

const schema = z.object({ kind: z.enum(["favorites", "history"]) });

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cleanup type." }, { status: 400 });
  }
  const exists = await prisma.user.count({ where: { id } });
  if (!exists) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (parsed.data.kind === "favorites") {
    const result = await prisma.userFavorite.deleteMany({ where: { userId: id } });
    invalidateThreadfinCatalogCache();
    scheduleThreadfinSync();
    return NextResponse.json({ ok: true, removed: result.count });
  }

  const result = await prisma.userViewingHistory.deleteMany({ where: { userId: id } });
  return NextResponse.json({ ok: true, removed: result.count });
}
