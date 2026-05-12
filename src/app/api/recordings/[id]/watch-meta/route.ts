import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import { resolveRecordingOwner } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { tickRecordingScheduler } from "@/lib/recordings/recording-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Metadata for `/watch?recording=<id>` — same shape consumers expect as stream sessions.
 */
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
        { error: "This recording is not ready for playback." },
        { status: 409 },
      );
    }

    const playbackUrl = `/api/recordings/${encodeURIComponent(id)}/play`;
    /** Synthetic — avoids matching live channels in the frequent ring. */
    const canonicalUrl = `zenede:recording:${id}`;

    return NextResponse.json({
      title: row.channelName,
      logo: row.channelLogo,
      group: row.channelGroup,
      playbackUrl,
      canonicalUrl,
    });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
