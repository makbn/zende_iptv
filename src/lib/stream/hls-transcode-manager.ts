import "server-only";

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServerLogger } from "@/core/logging/server";
import { ffmpegCommand } from "@/lib/recordings/ffmpeg-binary";
import {
  buildProgressiveTranscodeArgs,
  TRANSCODE_HLS_CHUNK_SEGMENTS,
  TRANSCODE_HLS_SEGMENT_SECONDS,
} from "@/lib/stream/progressive-transcode";

const log = createServerLogger("lib.stream.hls-transcode");
const ROOT = join(tmpdir(), "zende-hls-transcode");
const IDLE_TIMEOUT_MS = 5 * 60_000;
const SEGMENT_WAIT_TIMEOUT_MS = 45_000;

type HlsJob = {
  key: string;
  sessionId: string;
  directory: string;
  playlistPath: string;
  startSegment: number;
  endSegmentExclusive?: number;
  process: ReturnType<typeof spawn> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  stderrTail: string;
};

const globalJobs = globalThis as typeof globalThis & {
  __zendeHlsTranscodeJobs?: Map<string, Promise<HlsJob>>;
};
const jobs = globalJobs.__zendeHlsTranscodeJobs ?? new Map<string, Promise<HlsJob>>();
globalJobs.__zendeHlsTranscodeJobs = jobs;

function assertSessionId(sessionId: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(sessionId)) {
    throw new Error("Invalid transcode session ID.");
  }
}

function armIdleTimer(job: HlsJob) {
  if (job.idleTimer) clearTimeout(job.idleTimer);
  job.idleTimer = setTimeout(() => {
    if (job.process && !job.process.killed) job.process.kill("SIGTERM");
    jobs.delete(job.key);
    void rm(job.directory, { recursive: true, force: true }).catch((error) => {
      // FFmpeg can race recursive cleanup while finalizing a temp segment. A
      // failed cache eviction must never become an unhandled server rejection.
      log.warn("compatibility transcode cache cleanup deferred", {
        sessionId: job.sessionId,
        startSegment: job.startSegment,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, IDLE_TIMEOUT_MS);
}

function segmentPath(job: HlsJob, segmentNumber: string): string {
  return join(job.directory, `segment-${segmentNumber}.ts`);
}

async function waitForSegment(job: HlsJob, segmentNumber: string): Promise<void> {
  const deadline = Date.now() + SEGMENT_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const info = await stat(segmentPath(job, segmentNumber));
      if (info.isFile()) return;
    } catch {
      // FFmpeg has not atomically finalized the requested segment yet.
    }
    if (!job.process) {
      throw new Error(
        `Compatibility transcode exited before segment ${segmentNumber}: ${job.stderrTail.slice(-500)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for compatibility segment ${segmentNumber}.`);
}

async function startJob(
  key: string,
  sessionId: string,
  inputUrl: string,
  internalHeaders: string,
  startSegment: number,
  segmentCount?: number,
): Promise<HlsJob> {
  assertSessionId(sessionId);
  await mkdir(ROOT, { recursive: true });
  const directory = join(
    ROOT,
    sessionId,
    segmentCount ? `chunk-${String(startSegment).padStart(6, "0")}` : "event",
  );
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const playlistPath = join(directory, "playlist.m3u8");
  const segmentPattern = join(directory, "segment-%06d.ts");
  const proc = spawn(
    ffmpegCommand(),
    buildProgressiveTranscodeArgs(
      inputUrl,
      internalHeaders,
      playlistPath,
      segmentPattern,
      segmentCount ? { startSegment, segmentCount } : undefined,
    ),
    { stdio: ["ignore", "ignore", "pipe"], detached: false },
  );
  const job: HlsJob = {
    key,
    sessionId,
    directory,
    playlistPath,
    startSegment,
    ...(segmentCount
      ? { endSegmentExclusive: startSegment + segmentCount }
      : {}),
    process: proc,
    idleTimer: null,
    stderrTail: "",
  };
  proc.stderr.on("data", (chunk: Buffer) => {
    job.stderrTail = (job.stderrTail + chunk.toString("utf8")).slice(-4000);
  });
  proc.once("spawn", () => {
    log.info("segmented compatibility transcode started", {
      sessionId,
      outputVideo: "h264",
      outputAudio: "aac-stereo",
      segmentSeconds: TRANSCODE_HLS_SEGMENT_SECONDS,
      startSegment,
      segmentCount,
    });
  });
  proc.once("error", (error) => {
    job.stderrTail = error.message;
    job.process = null;
    log.error("segmented compatibility transcode failed to start", {
      sessionId,
      message: error.message,
    });
  });
  proc.once("close", (code, signal) => {
    job.process = null;
    log.info("segmented compatibility transcode stopped", {
      sessionId,
      code,
      signal,
      stderr: job.stderrTail.trim().slice(-1200) || undefined,
    });
  });
  armIdleTimer(job);
  await waitForSegment(job, String(startSegment).padStart(6, "0"));
  return job;
}

export async function ensureHlsTranscodeJob(input: {
  sessionId: string;
  inputUrl: string;
  internalHeaders: string;
  /** Known VOD duration plus requested segment enables seek-window encoding. */
  durationSeconds?: number;
  targetSegment?: number;
}): Promise<HlsJob> {
  assertSessionId(input.sessionId);
  const finiteVod =
    input.durationSeconds != null &&
    Number.isFinite(input.durationSeconds) &&
    input.durationSeconds > 0 &&
    input.targetSegment != null &&
    Number.isInteger(input.targetSegment) &&
    input.targetSegment >= 0;

  let startSegment = 0;
  let segmentCount: number | undefined;
  let key = `event:${input.sessionId}`;
  if (finiteVod) {
    const totalSegments = Math.ceil(
      input.durationSeconds! / TRANSCODE_HLS_SEGMENT_SECONDS,
    );
    if (input.targetSegment! >= totalSegments) {
      throw new Error("Requested compatibility segment is outside the VOD duration.");
    }
    const prefix = `vod:${input.sessionId}:`;
    for (const [existingKey, existingJob] of jobs) {
      if (!existingKey.startsWith(prefix)) continue;
      const existingStart = Number(existingKey.slice(prefix.length));
      if (
        Number.isInteger(existingStart) &&
        input.targetSegment! >= existingStart &&
        input.targetSegment! < existingStart + TRANSCODE_HLS_CHUNK_SEGMENTS
      ) {
        const job = await existingJob;
        armIdleTimer(job);
        return job;
      }
    }

    // Begin exactly at the requested segment. Aligning to a large fixed window
    // made a seek wait while FFmpeg unnecessarily encoded up to two minutes of
    // earlier 4K video. Sequential requests reuse this forward window.
    startSegment = input.targetSegment!;
    segmentCount = Math.min(
      TRANSCODE_HLS_CHUNK_SEGMENTS,
      totalSegments - startSegment,
    );
    key = `vod:${input.sessionId}:${startSegment}`;
  }

  let pending = jobs.get(key);
  if (!pending) {
    pending = startJob(
      key,
      input.sessionId,
      input.inputUrl,
      input.internalHeaders,
      startSegment,
      segmentCount,
    );
    jobs.set(key, pending);
    pending.catch(() => jobs.delete(key));
  }
  const job = await pending;
  armIdleTimer(job);
  return job;
}

export async function readHlsPlaylist(job: HlsJob): Promise<string> {
  armIdleTimer(job);
  return readFile(job.playlistPath, "utf8");
}

export async function readHlsSegment(
  job: HlsJob,
  segmentNumber: string,
): Promise<Uint8Array | null> {
  if (!/^\d{6}$/.test(segmentNumber)) return null;
  armIdleTimer(job);
  const numericSegment = Number(segmentNumber);
  if (
    numericSegment < job.startSegment ||
    (job.endSegmentExclusive != null &&
      numericSegment >= job.endSegmentExclusive)
  ) {
    return null;
  }
  await waitForSegment(job, segmentNumber);
  const path = segmentPath(job, segmentNumber);
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return readFile(path);
  } catch {
    return null;
  }
}
