import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/gate-api";
import { startInternalDownload } from "@/lib/downloads/internal-download-service";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(4).max(8192),
  title: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid download request." }, { status: 400 });
  try {
    return NextResponse.json(
      { ok: true, ...(await startInternalDownload(parsed.data)) },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start internal download." },
      { status: 400 },
    );
  }
}
