import { NextResponse } from "next/server";

import { resolveRecordingOwner } from "@/lib/recordings/recording-owner";
import { ensureRecordingSchedulerStarted } from "@/lib/recordings/recording-scheduler-loop";
import { tickRecordingScheduler } from "@/lib/recordings/recording-service";
import { isFfmpegAvailable } from "@/lib/recordings/ffmpeg-binary";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

function big(n: bigint | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  return n.toString();
}

export async function GET(request: Request) {
  const owner = await resolveRecordingOwner(request);
  if (owner instanceof Response) return owner;

  ensureRecordingSchedulerStarted();
  await tickRecordingScheduler();

  const [schedules, active, library, failed] = await Promise.all([
    prisma.recordingSchedule.findMany({
      where: { ownerUserId: owner, status: "SCHEDULED" },
      orderBy: { startsAt: "asc" },
      take: 80,
    }),
    prisma.recording.findMany({
      where: { ownerUserId: owner, status: "RECORDING" },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    prisma.recording.findMany({
      where: {
        ownerUserId: owner,
        status: { in: ["COMPLETED", "STOPPED_EARLY"] },
      },
      orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    prisma.recording.findMany({
      where: { ownerUserId: owner, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const now = Date.now();

  return NextResponse.json({
    ffmpegAvailable: isFfmpegAvailable(),
    schedules: schedules.map((s) => ({
      id: s.id,
      channelUrl: s.channelUrl,
      channelName: s.channelName,
      channelLogo: s.channelLogo,
      channelGroup: s.channelGroup,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
    active: active.map((r) => {
      const started = r.startedAt?.getTime() ?? now;
      const plannedMs = (r.plannedSeconds ?? 0) * 1000;
      const plannedEnd = started + plannedMs;
      return {
        id: r.id,
        channelUrl: r.channelUrl,
        channelName: r.channelName,
        channelLogo: r.channelLogo,
        channelGroup: r.channelGroup,
        startedAt: r.startedAt?.toISOString() ?? null,
        plannedSeconds: r.plannedSeconds,
        plannedEndsAt: new Date(plannedEnd).toISOString(),
        scheduleId: r.scheduleId,
      };
    }),
    library: library.map((r) => ({
      id: r.id,
      channelName: r.channelName,
      channelLogo: r.channelLogo,
      channelGroup: r.channelGroup,
      status: r.status,
      startedAt: r.startedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      plannedSeconds: r.plannedSeconds,
      sizeBytes: big(r.sizeBytes),
      scheduleId: r.scheduleId,
    })),
    recentFailures: failed.map((r) => ({
      id: r.id,
      channelName: r.channelName,
      channelUrl: r.channelUrl,
      channelLogo: r.channelLogo,
      channelGroup: r.channelGroup,
      scheduleId: r.scheduleId,
      startedAt: r.startedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      error: r.error,
    })),
  });
}
