import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRecordingOwner } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { RecordingPrepError } from "@/lib/recordings/recording-prep";
import {
  startImmediateRecording,
  tickRecordingScheduler,
} from "@/lib/recordings/recording-service";
import { isFfmpegAvailable } from "@/lib/recordings/ffmpeg-binary";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    channelUrl: z.string().min(4).max(8192),
    channelName: z.string().min(1).max(512),
    channelLogo: z.string().max(8192).optional().nullable(),
    channelGroup: z.string().max(512).optional().nullable(),
    durationMinutes: z.number().finite().positive().max(480).optional(),
    endsAt: z.string().min(8).max(64).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.durationMinutes === undefined && val.endsAt === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide durationMinutes or endsAt (ISO).",
      });
    }
  });

export async function POST(request: Request) {
  const owner = await resolveRecordingOwner(request);
  if (owner instanceof Response) return owner;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  let durationSeconds: number;
  if (body.durationMinutes !== undefined) {
    durationSeconds = Math.round(body.durationMinutes * 60);
  } else if (body.endsAt) {
    const end = new Date(body.endsAt);
    if (Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid endsAt." }, { status: 400 });
    }
    durationSeconds = Math.round((end.getTime() - Date.now()) / 1000);
  } else {
    return NextResponse.json(
      { error: "Provide durationMinutes or endsAt." },
      { status: 400 },
    );
  }

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  try {
    const { id } = await startImmediateRecording({
      ownerUserId: owner,
      channelUrl: body.channelUrl,
      channelName: body.channelName,
      channelLogo: body.channelLogo ?? undefined,
      channelGroup: body.channelGroup ?? undefined,
      durationSeconds,
    });
    return NextResponse.json({
      recordingId: id,
      ffmpegAvailable: isFfmpegAvailable(),
    });
  } catch (e) {
    if (e instanceof RecordingPrepError) {
      return NextResponse.json(
        { error: e.message, ...(e.code ? { code: e.code } : {}) },
        { status: e.status },
      );
    }
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
