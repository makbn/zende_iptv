import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { resolveRecordingOwner } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { tickRecordingScheduler } from "@/lib/recordings/recording-service";
import { resolveStoredRecordingFile } from "@/lib/recordings/recordings-dir";
import { prisma } from "@/lib/db/prisma";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const owner = await resolveRecordingOwner(request);
  if (owner instanceof Response) return owner;
  const { id } = await ctx.params;

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    const row = await prisma.recording.findFirst({
      where: { id, ownerUserId: owner },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (row.status !== "COMPLETED" && row.status !== "STOPPED_EARLY") {
      return NextResponse.json(
        { error: "This recording is not available for download yet." },
        { status: 409 },
      );
    }

    const abs = resolveStoredRecordingFile(owner, row.relativePath);
    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      return NextResponse.json({ error: "File missing on disk." }, { status: 404 });
    }
    if (!st.isFile() || st.size < 1) {
      return NextResponse.json({ error: "File missing on disk." }, { status: 404 });
    }

    const safeName = `${row.channelName.replace(/[^\w\s-]/g, "").trim().slice(0, 80) || "channel"}-${id.slice(0, 8)}.mp4`;

    const nodeStream = createReadStream(abs);
    const webStream = Readable.toWeb(nodeStream);
    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(st.size),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
