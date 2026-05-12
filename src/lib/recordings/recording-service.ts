import "server-only";

import fs from "node:fs/promises";

import type { RecordingSchedule } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import { isFfmpegAvailable } from "./ffmpeg-binary";
import { spawnFfmpegRecording } from "./ffmpeg-runner";
import {
  newRecordingId,
  prepareRecordingSource,
  RecordingPrepError,
} from "./recording-prep";
import { ensureOwnerRecordingDir, resolveStoredRecordingFile } from "./recordings-dir";

export const RECORDING_MIN_SECONDS = 60;
export const RECORDING_MAX_SECONDS = 8 * 60 * 60;

function clampDurationSeconds(n: number): number {
  if (!Number.isFinite(n)) return RECORDING_MIN_SECONDS;
  return Math.min(
    RECORDING_MAX_SECONDS,
    Math.max(RECORDING_MIN_SECONDS, Math.floor(n)),
  );
}

export async function assertFfmpegOrThrow(): Promise<void> {
  if (!isFfmpegAvailable()) {
    throw new RecordingPrepError(
      "ffmpeg is not available on this server. Install ffmpeg and ensure it is on PATH.",
      503,
    );
  }
}

export async function createSchedule(input: {
  ownerUserId: string;
  channelUrl: string;
  channelName: string;
  channelLogo?: string;
  channelGroup?: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<RecordingSchedule> {
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();
  if (durationMs < RECORDING_MIN_SECONDS * 1000) {
    throw new RecordingPrepError(
      `Recording must be at least ${RECORDING_MIN_SECONDS / 60} minutes.`,
      400,
    );
  }
  if (durationMs > RECORDING_MAX_SECONDS * 1000) {
    throw new RecordingPrepError(
      `Recording cannot exceed ${RECORDING_MAX_SECONDS / 3600} hours.`,
      400,
    );
  }

  return prisma.recordingSchedule.create({
    data: {
      ownerUserId: input.ownerUserId,
      channelUrl: input.channelUrl.trim(),
      channelName: input.channelName.trim(),
      channelLogo: input.channelLogo?.trim() || null,
      channelGroup: input.channelGroup?.trim() || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
  });
}

export async function updateSchedule(input: {
  ownerUserId: string;
  id: string;
  channelUrl?: string;
  channelName?: string;
  channelLogo?: string | null;
  channelGroup?: string | null;
  startsAt?: Date;
  endsAt?: Date;
}): Promise<RecordingSchedule> {
  const existing = await prisma.recordingSchedule.findFirst({
    where: { id: input.id, ownerUserId: input.ownerUserId },
  });
  if (!existing) {
    throw new RecordingPrepError("Schedule not found.", 404);
  }
  if (existing.status !== "SCHEDULED") {
    throw new RecordingPrepError("Only upcoming schedules can be edited.", 409);
  }

  const startsAt = input.startsAt ?? existing.startsAt;
  const endsAt = input.endsAt ?? existing.endsAt;
  const durationMs = endsAt.getTime() - startsAt.getTime();
  if (durationMs < RECORDING_MIN_SECONDS * 1000) {
    throw new RecordingPrepError(
      `Recording must be at least ${RECORDING_MIN_SECONDS / 60} minutes.`,
      400,
    );
  }
  if (durationMs > RECORDING_MAX_SECONDS * 1000) {
    throw new RecordingPrepError(
      `Recording cannot exceed ${RECORDING_MAX_SECONDS / 3600} hours.`,
      400,
    );
  }

  return prisma.recordingSchedule.update({
    where: { id: input.id },
    data: {
      ...(input.channelUrl !== undefined
        ? { channelUrl: input.channelUrl.trim() }
        : {}),
      ...(input.channelName !== undefined
        ? { channelName: input.channelName.trim() }
        : {}),
      ...(input.channelLogo !== undefined
        ? { channelLogo: input.channelLogo?.trim() || null }
        : {}),
      ...(input.channelGroup !== undefined
        ? { channelGroup: input.channelGroup?.trim() || null }
        : {}),
      startsAt,
      endsAt,
    },
  });
}

export async function cancelSchedule(
  ownerUserId: string,
  id: string,
): Promise<void> {
  const existing = await prisma.recordingSchedule.findFirst({
    where: { id, ownerUserId },
  });
  if (!existing) {
    throw new RecordingPrepError("Schedule not found.", 404);
  }
  if (existing.status !== "SCHEDULED") {
    throw new RecordingPrepError("This schedule can no longer be cancelled.", 409);
  }
  await prisma.recordingSchedule.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}

async function markRecordingFailed(id: string, message: string): Promise<void> {
  await prisma.recording.update({
    where: { id },
    data: {
      status: "FAILED",
      endedAt: new Date(),
      error: message.slice(0, 2000),
    },
  });
}

export async function startImmediateRecording(input: {
  ownerUserId: string;
  channelUrl: string;
  channelName: string;
  channelLogo?: string;
  channelGroup?: string;
  durationSeconds: number;
}): Promise<{ id: string }> {
  const durationSec = clampDurationSeconds(input.durationSeconds);
  await assertFfmpegOrThrow();
  const prep = await prepareRecordingSource(input.channelUrl);
  const id = newRecordingId();
  const relativePath = `${input.ownerUserId}/${id}.mp4`;
  await ensureOwnerRecordingDir(input.ownerUserId);
  const absPath = resolveStoredRecordingFile(input.ownerUserId, relativePath);
  const now = new Date();

  await prisma.recording.create({
    data: {
      id,
      ownerUserId: input.ownerUserId,
      scheduleId: null,
      channelUrl: prep.rawChannelUrl,
      channelName: input.channelName.trim(),
      channelLogo: input.channelLogo?.trim() || null,
      channelGroup: input.channelGroup?.trim() || null,
      relativePath,
      status: "RECORDING",
      startedAt: now,
      plannedSeconds: durationSec,
    },
  });

  try {
    await fs.rm(absPath, { force: true });
  } catch {
    /* ignore */
  }

  spawnFfmpegRecording({
    recordingId: id,
    upstreamUrl: prep.upstreamUrl,
    durationSec,
    outputPath: absPath,
  });

  return { id };
}

export async function tryDispatchSchedule(scheduleId: string): Promise<boolean> {
  const now = new Date();
  type TxPayload = {
    schedule: RecordingSchedule;
    recordingId: string;
    relativePath: string;
    durationSec: number;
  };

  const payload = await prisma.$transaction(async (tx) => {
    const s = await tx.recordingSchedule.findFirst({
      where: {
        id: scheduleId,
        status: "SCHEDULED",
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    });
    if (!s) return null;

    const durationSec = clampDurationSeconds(
      (s.endsAt.getTime() - now.getTime()) / 1000,
    );
    const recordingId = newRecordingId();
    const relativePath = `${s.ownerUserId}/${recordingId}.mp4`;

    await tx.recording.create({
      data: {
        id: recordingId,
        ownerUserId: s.ownerUserId,
        scheduleId: s.id,
        channelUrl: s.channelUrl.trim(),
        channelName: s.channelName.trim(),
        channelLogo: s.channelLogo,
        channelGroup: s.channelGroup,
        relativePath,
        status: "RECORDING",
        startedAt: now,
        plannedSeconds: durationSec,
      },
    });

    await tx.recordingSchedule.update({
      where: { id: s.id },
      data: { status: "DISPATCHED" },
    });

    const out: TxPayload = {
      schedule: s,
      recordingId,
      relativePath,
      durationSec,
    };
    return out;
  });

  if (!payload) return false;

  await ensureOwnerRecordingDir(payload.schedule.ownerUserId);
  const absPath = resolveStoredRecordingFile(
    payload.schedule.ownerUserId,
    payload.relativePath,
  );

  try {
    await assertFfmpegOrThrow();
    const prep = await prepareRecordingSource(payload.schedule.channelUrl);
    await prisma.recording.update({
      where: { id: payload.recordingId },
      data: { channelUrl: prep.rawChannelUrl },
    });
    try {
      await fs.rm(absPath, { force: true });
    } catch {
      /* ignore */
    }
    spawnFfmpegRecording({
      recordingId: payload.recordingId,
      upstreamUrl: prep.upstreamUrl,
      durationSec: payload.durationSec,
      outputPath: absPath,
    });
  } catch (e) {
    const msg =
      e instanceof RecordingPrepError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Recording failed to start.";
    await markRecordingFailed(payload.recordingId, msg);
  }

  return true;
}

export async function tickRecordingScheduler(): Promise<void> {
  const now = new Date();
  const due = await prisma.recordingSchedule.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { startsAt: "asc" },
    take: 6,
    select: { id: true },
  });
  for (const row of due) {
    await tryDispatchSchedule(row.id);
  }

  const missed = await prisma.recordingSchedule.findMany({
    where: {
      status: "SCHEDULED",
      endsAt: { lte: now },
    },
    select: { id: true },
    take: 20,
  });
  for (const row of missed) {
    await prisma.recordingSchedule.update({
      where: { id: row.id },
      data: { status: "CANCELLED" },
    });
  }
}
