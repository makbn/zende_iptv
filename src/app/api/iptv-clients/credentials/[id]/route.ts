import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

type DeleteCtx =
  | { mode: "any" }
  | { mode: "scoped"; ownerUserId: string | null };

async function deleteContext(
  gate: Awaited<ReturnType<typeof gateApiRequest>>,
): Promise<{ ok: false; response: Response } | { ok: true; ctx: DeleteCtx }> {
  if ("response" in gate) return { ok: false, response: gate.response };

  if (!gate.authEnabled) {
    return {
      ok: true,
      ctx: { mode: "scoped", ownerUserId: null },
    };
  }

  if (gate.user.role === "ADMIN") {
    return { ok: true, ctx: { mode: "any" } };
  }

  return {
    ok: true,
    ctx: { mode: "scoped", ownerUserId: gate.user.id },
  };
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  const d = await deleteContext(gate);
  if (!d.ok) return d.response;

  const { id } = await context.params;

  const row = await prisma.iptvClientCredential.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (d.ctx.mode === "scoped" && row.ownerUserId !== d.ctx.ownerUserId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.iptvClientCredential.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
