import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/gate-api";
import {
  internalDownloadRoots,
  loadInternalDownloadSettings,
  saveInternalDownloadDirectory,
} from "@/lib/downloads/internal-download-settings";

export const runtime = "nodejs";

const patchSchema = z.object({
  directoryPath: z.string().max(4096).nullable(),
});

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  return NextResponse.json({
    ...(await loadInternalDownloadSettings()),
    allowedRoots: internalDownloadRoots(),
  });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid download directory." }, { status: 400 });
  try {
    return NextResponse.json({
      ...(await saveInternalDownloadDirectory(parsed.data.directoryPath)),
      allowedRoots: internalDownloadRoots(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save download directory." },
      { status: 400 },
    );
  }
}
