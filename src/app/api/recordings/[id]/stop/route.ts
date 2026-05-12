import { NextResponse } from "next/server";

import { resolveRecordingOwner } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { RecordingPrepError } from "@/lib/recordings/recording-prep";
import { stopRecordingForOwner } from "@/lib/recordings/recording-stop";
import { tickRecordingScheduler } from "@/lib/recordings/recording-service";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const owner = await resolveRecordingOwner(request);
  if (owner instanceof Response) return owner;
  const { id } = await ctx.params;

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    await stopRecordingForOwner(owner, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RecordingPrepError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
