import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRecordingOwner } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { RecordingPrepError } from "@/lib/recordings/recording-prep";
import {
  createSchedule,
  tickRecordingScheduler,
} from "@/lib/recordings/recording-service";
import { isFfmpegAvailable } from "@/lib/recordings/ffmpeg-binary";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";

export const runtime = "nodejs";

const createBody = z
  .object({
    channelUrl: z.string().min(4).max(8192),
    channelName: z.string().min(1).max(512),
    channelLogo: z.string().max(8192).optional().nullable(),
    channelGroup: z.string().max(512).optional().nullable(),
    startsAt: z.string().min(8).max(64),
    endsAt: z.string().min(8).max(64).optional(),
    durationMinutes: z.number().finite().positive().max(480).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.endsAt && val.durationMinutes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide endsAt (ISO) or durationMinutes.",
      });
    }
  });

function parseDate(label: string, raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new RecordingPrepError(`Invalid ${label} datetime.`, 400);
  }
  return d;
}

export async function POST(request: Request) {
  const owner = await resolveRecordingOwner(request);
  if (owner instanceof Response) return owner;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  let startsAt: Date;
  let endsAt: Date;
  try {
    startsAt = parseDate("startsAt", body.startsAt);
    if (body.endsAt) {
      endsAt = parseDate("endsAt", body.endsAt);
    } else if (body.durationMinutes !== undefined) {
      endsAt = new Date(
        startsAt.getTime() + Math.round(body.durationMinutes * 60_000),
      );
    } else {
      return NextResponse.json(
        { error: "Provide endsAt or durationMinutes." },
        { status: 400 },
      );
    }
  } catch (e) {
    if (e instanceof RecordingPrepError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    const row = await createSchedule({
      ownerUserId: owner,
      channelUrl: body.channelUrl,
      channelName: body.channelName,
      channelLogo: body.channelLogo ?? undefined,
      channelGroup: body.channelGroup ?? undefined,
      startsAt,
      endsAt,
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
        createdAt: row.createdAt.toISOString(),
      },
      ffmpegAvailable: isFfmpegAvailable(),
    });
  } catch (e) {
    if (e instanceof RecordingPrepError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
