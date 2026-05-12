import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import { resolveRecordingOwner } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { tickRecordingScheduler } from "@/lib/recordings/recording-service";
import { resolveStoredRecordingFile } from "@/lib/recordings/recordings-dir";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const DELETABLE_STATUSES = ["FAILED", "COMPLETED", "STOPPED_EARLY"] as const;

/**
 * Remove a recording row and its MP4 (and encoder sidecar if present). Allowed for
 * finished / failed rows — not while `RECORDING`.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const owner = await resolveRecordingOwner(request);
  if (owner instanceof Response) return owner;
  const { id } = await ctx.params;

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    const row = await prisma.recording.findFirst({
      where: {
        id,
        ownerUserId: owner,
        status: { in: [...DELETABLE_STATUSES] },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: "Recording not found or cannot be removed." },
        { status: 404 },
      );
    }

    try {
      const abs = resolveStoredRecordingFile(owner, row.relativePath);
      await fs.rm(abs, { force: true });
      await fs.rm(`${abs}.encoder.json`, { force: true });
    } catch {
      /* file may already be missing */
    }

    await prisma.recording.delete({ where: { id: row.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
