import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureAuthConfigRow, setAuthEnabled } from "@/lib/auth/auth-config";
import { requireAdmin } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const patchSchema = z.object({
  enabled: z.boolean(),
});

/** Turn login requirement on or off (admin only). Disabling does not delete users. */
export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.enabled) {
    const n = await prisma.user.count();
    if (n === 0) {
      return NextResponse.json(
        {
          error:
            "Create an administrator first (bootstrap), or restore users from backup.",
        },
        { status: 400 },
      );
    }
  }

  await setAuthEnabled(parsed.data.enabled);
  const cfg = await ensureAuthConfigRow();

  return NextResponse.json({ ok: true, authEnabled: cfg.enabled });
}
