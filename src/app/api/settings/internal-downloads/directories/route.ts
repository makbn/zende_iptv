import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/gate-api";
import {
  browseInternalDownloadDirectories,
  createInternalDownloadDirectory,
} from "@/lib/downloads/internal-download-settings";

export const runtime = "nodejs";

const createSchema = z.object({
  parent: z.string().min(1).max(4096),
  name: z.string().min(1).max(80),
});

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  try {
    const requested = new URL(request.url).searchParams.get("path");
    return NextResponse.json(await browseInternalDownloadDirectories(requested));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not browse server directories." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid folder request." }, { status: 400 });
  try {
    const created = await createInternalDownloadDirectory(parsed.data.parent, parsed.data.name);
    return NextResponse.json(await browseInternalDownloadDirectories(created), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create folder." },
      { status: 400 },
    );
  }
}
