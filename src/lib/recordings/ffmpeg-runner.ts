import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";

import type { RecordingStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import { internalRelayFfmpegHeadersBlock } from "@/lib/stream/internal-relay-request";

import { ffmpegCommand } from "./ffmpeg-binary";

type ActiveEntry = {
  proc: ChildProcess;
  stopRequested: boolean;
  /** Resolves after DB reflects the terminal recording state. */
  settled: Promise<void>;
  resolveSettled: () => void;
};

const active = new Map<string, ActiveEntry>();

function encoderSidecarPath(outputPath: string): string {
  return `${outputPath}.encoder.json`;
}

async function unlinkEncoderSidecar(outputPath: string): Promise<void> {
  try {
    await fs.unlink(encoderSidecarPath(outputPath));
  } catch {
    /* missing is fine */
  }
}

type EncoderSidecar = { recordingId: string; pid: number };

async function readEncoderSidecar(
  outputPath: string,
): Promise<EncoderSidecar | null> {
  try {
    const raw = await fs.readFile(encoderSidecarPath(outputPath), "utf8");
    const o = JSON.parse(raw) as { recordingId?: unknown; pid?: unknown };
    if (typeof o.recordingId !== "string" || typeof o.pid !== "number") {
      return null;
    }
    if (!Number.isFinite(o.pid) || o.pid <= 0) return null;
    return { recordingId: o.recordingId, pid: Math.floor(o.pid) };
  } catch {
    return null;
  }
}

export type FfmpegRecordingStart = {
  recordingId: string;
  upstreamUrl: string;
  durationSec: number;
  outputPath: string;
};

function buildFfmpegArgs(input: FfmpegRecordingStart): string[] {
  const dur = Math.max(1, Math.floor(input.durationSec));
  const args: string[] = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-nostats",
    "-rw_timeout",
    "20000000",
    "-user_agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "-headers",
    internalRelayFfmpegHeadersBlock(),
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto,data",
    // Relay playlists use /api/stream/proxy/...?h=<hash> — no ".ts" in the path; default
    // allowed_segment_extensions rejects those URLs (see ffmpeg hls demuxer AVOptions).
    "-allowed_extensions",
    "ALL",
    "-allowed_segment_extensions",
    "ALL",
    "-extension_picky",
    "0",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
  ];
  args.push(
    "-i",
    input.upstreamUrl,
    "-t",
    String(dur),
    "-c",
    "copy",
    "-f",
    "mp4",
    "-y",
    input.outputPath,
  );
  return args;
}

async function finalizeRecording(
  recordingId: string,
  outputPath: string,
  opts: {
    stopRequested: boolean;
    code: number | null;
    signal: NodeJS.Signals | null;
    stderrTail: string;
  },
): Promise<void> {
  let size: bigint | null = null;
  try {
    const st = await fs.stat(outputPath);
    size = BigInt(st.size);
  } catch {
    size = null;
  }
  const okFile = size !== null && size > BigInt(0);

  let status: RecordingStatus;
  let error: string | null = null;

  if (opts.stopRequested && okFile) {
    status = "STOPPED_EARLY";
  } else if (opts.code === 0 && okFile) {
    status = "COMPLETED";
  } else if (opts.code === 0 && !okFile) {
    status = "FAILED";
    error = "Recording produced an empty file.";
  } else if (okFile && (opts.signal === "SIGINT" || opts.signal === "SIGTERM")) {
    status = "STOPPED_EARLY";
  } else {
    status = "FAILED";
    error =
      opts.stderrTail.trim().slice(0, 2000) ||
      `ffmpeg exited with code ${opts.code ?? "?"} signal ${opts.signal ?? "—"}`;
  }

  await prisma.recording.updateMany({
    where: { id: recordingId, status: "RECORDING" },
    data: {
      status,
      endedAt: new Date(),
      ...(size !== null ? { sizeBytes: size } : {}),
      ...(error ? { error } : {}),
    },
  });
}

export function isRecordingProcessActive(recordingId: string): boolean {
  return active.has(recordingId);
}

export function spawnFfmpegRecording(input: FfmpegRecordingStart): void {
  if (active.has(input.recordingId)) {
    throw new Error("Recording already running.");
  }

  let resolveSettled!: () => void;
  const settled = new Promise<void>((r) => {
    resolveSettled = r;
  });

  const cmd = ffmpegCommand();
  const proc = spawn(cmd, buildFfmpegArgs(input), {
    stdio: ["ignore", "ignore", "pipe"],
    detached: false,
  });

  const entry: ActiveEntry = {
    proc,
    stopRequested: false,
    settled,
    resolveSettled,
  };
  active.set(input.recordingId, entry);

  try {
    if (typeof proc.pid === "number" && proc.pid > 0) {
      writeFileSync(
        encoderSidecarPath(input.outputPath),
        JSON.stringify({ recordingId: input.recordingId, pid: proc.pid }),
        "utf8",
      );
    }
  } catch {
    /* still try to record — stop may fall back to in-memory only */
  }

  let stderrTail = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf-8")).slice(-6000);
  });

  let finished = false;
  const finish = async (
    code: number | null,
    signal: NodeJS.Signals | null,
    updater: () => Promise<void>,
  ) => {
    if (finished) {
      resolveSettled();
      return;
    }
    finished = true;
    active.delete(input.recordingId);
    await unlinkEncoderSidecar(input.outputPath);
    try {
      await updater();
    } finally {
      resolveSettled();
    }
  };

  proc.on("error", (err) => {
    void finish(null, null, async () => {
      await unlinkEncoderSidecar(input.outputPath);
      await prisma.recording.updateMany({
        where: { id: input.recordingId, status: "RECORDING" },
        data: {
          status: "FAILED",
          endedAt: new Date(),
          error: err.message.slice(0, 2000),
        },
      });
    });
  });

  proc.on("close", (code, signal) => {
    void finish(code, signal, async () => {
      const stopRequested = entry.stopRequested;
      await finalizeRecording(input.recordingId, input.outputPath, {
        stopRequested,
        code,
        signal,
        stderrTail,
      });
    });
  });
}

async function waitPidGone(pid: number, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

/**
 * When the in-memory `active` map was lost (HMR, server restart) but ffmpeg is still running,
 * we find it via the sidecar file written at spawn time and signal it by PID.
 */
async function stopByPersistedEncoder(
  recordingId: string,
  outputPath: string,
): Promise<boolean> {
  const meta = await readEncoderSidecar(outputPath);
  if (!meta || meta.recordingId !== recordingId) {
    return false;
  }

  let alive = true;
  try {
    process.kill(meta.pid, 0);
  } catch {
    alive = false;
  }

  if (!alive) {
    await unlinkEncoderSidecar(outputPath);
    await finalizeRecording(recordingId, outputPath, {
      stopRequested: true,
      code: null,
      signal: "SIGINT",
      stderrTail: "",
    });
    return true;
  }

  try {
    process.kill(meta.pid, "SIGINT");
  } catch {
    await unlinkEncoderSidecar(outputPath);
    return false;
  }

  let gone = await waitPidGone(meta.pid, 120_000);
  if (!gone) {
    try {
      process.kill(meta.pid, "SIGKILL");
    } catch {
      /* ignore */
    }
    gone = await waitPidGone(meta.pid, 10_000);
  }

  await unlinkEncoderSidecar(outputPath);
  await finalizeRecording(recordingId, outputPath, {
    stopRequested: true,
    code: null,
    signal: "SIGINT",
    stderrTail: "",
  });
  return true;
}

export async function requestStopFfmpegRecording(
  recordingId: string,
  outputAbsPath?: string,
): Promise<boolean> {
  const entry = active.get(recordingId);
  if (entry) {
    entry.stopRequested = true;
    entry.proc.kill("SIGINT");
    await entry.settled;
    return true;
  }
  if (outputAbsPath) {
    return stopByPersistedEncoder(recordingId, outputAbsPath);
  }
  return false;
}
