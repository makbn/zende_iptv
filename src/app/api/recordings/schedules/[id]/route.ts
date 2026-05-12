import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRecordingOwner } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { RecordingPrepError } from "@/lib/recordings/recording-prep";
import {
  cancelSchedule,
  tickRecordingScheduler,
  updateSchedule,
} from "@/lib/recordings/recording-service";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";

export const runtime = "nodejs";

const patchBody = z.object({
  channelUrl: z.string().min(4).max(8192).optional(),
  channelName: z.string().min(1).max(512).optional(),
  channelLogo: z.string().max(8192).optional().nullable(),
  channelGroup: z.string().max(512).optional().nullable(),
  startsAt: z.string().min(8).max(64).optional(),
  endsAt: z.string().min(8).max(64).optional(),
});

function parseDate(label: string, raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new RecordingPrepError(`Invalid ${label} datetime.`, 400);
  }
  return d;
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const owner = await resolveRecordingOwner(request);
  if (owner instanceof Response) return owner;
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    const row = await updateSchedule({
      ownerUserId: owner,
      id,
      ...(body.channelUrl !== undefined ? { channelUrl: body.channelUrl } : {}),
      ...(body.channelName !== undefined ? { channelName: body.channelName } : {}),
      ...(body.channelLogo !== undefined ? { channelLogo: body.channelLogo } : {}),
      ...(body.channelGroup !== undefined ? { channelGroup: body.channelGroup } : {}),
      ...(body.startsAt !== undefined
        ? { startsAt: parseDate("startsAt", body.startsAt) }
        : {}),
      ...(body.endsAt !== undefined
        ? { endsAt: parseDate("endsAt", body.endsAt) }
        : {}),
    });
    return NextResponse.json({
      schedule: {
        id: row.id,
        channelUrl: row.channelUrl,
        channelName: row.channelName,
        channelLogo: row.channelLogo,
        channelGroup: row.channelGroup,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof RecordingPrepError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const owner = await resolveRecordingOwner(request);
  if (owner instanceof Response) return owner;
  const { id } = await ctx.params;

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    await cancelSchedule(owner, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RecordingPrepError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
