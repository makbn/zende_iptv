import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import { resolveRecordingOwnerForPlay } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { tickRecordingScheduler } from "@/lib/recordings/recording-service";
import { resolveStoredRecordingFile } from "@/lib/recordings/recordings-dir";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseRangeHeader(
  range: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!range || !range.startsWith("bytes=")) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!m) return null;
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0) start = 0;
  if (end >= size) end = size - 1;
  if (start > end) return null;
  return { start, end };
}

async function loadRecordingFileRow(
  owner: string,
  id: string,
): Promise<
  | { ok: true; abs: string; size: number }
  | { ok: false; response: NextResponse }
> {
  const row = await prisma.recording.findFirst({
    where: { id, ownerUserId: owner },
  });
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }
  if (row.status !== "COMPLETED" && row.status !== "STOPPED_EARLY") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This recording is not available for playback." },
        { status: 409 },
      ),
    };
  }
  const abs = resolveStoredRecordingFile(owner, row.relativePath);
  let st;
  try {
    st = await fs.stat(abs);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "File missing on disk." }, { status: 404 }),
    };
  }
  if (!st.isFile() || st.size < 1) {
    return {
      ok: false,
      response: NextResponse.json({ error: "File missing on disk." }, { status: 404 }),
    };
  }
  return { ok: true, abs, size: Number(st.size) };
}

/** Inline MP4 for `<video>` — supports `Range` for seeking; auth via Bearer or `pt` from watch-meta. */
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const owner = await resolveRecordingOwnerForPlay(request, id);
  if (owner instanceof Response) return owner;

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    const loaded = await loadRecordingFileRow(owner, id);
    if (!loaded.ok) return loaded.response;
    const { abs, size } = loaded;

    const range = parseRangeHeader(request.headers.get("range"), size);
    const baseHeaders: Record<string, string> = {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="recording.mp4"',
    };

    if (range) {
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const nodeStream = createReadStream(abs, { start, end });
      const webStream = Readable.toWeb(nodeStream);
      return new NextResponse(webStream as unknown as BodyInit, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
      });
    }

    const nodeStream = createReadStream(abs);
    const webStream = Readable.toWeb(nodeStream);
    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(size),
      },
    });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}

export async function HEAD(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const owner = await resolveRecordingOwnerForPlay(request, id);
  if (owner instanceof Response) return owner;

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    const loaded = await loadRecordingFileRow(owner, id);
    if (!loaded.ok) return loaded.response;
    const { size } = loaded;
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Content-Length": String(size),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
