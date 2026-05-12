import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";

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
    // New TCP connection per playlist/segment so custom -headers apply reliably
    // (persistent HTTP can omit extra headers on follow-up requests in some builds).
    "-http_persistent",
    "0",
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

  await prisma.recording.update({
    where: { id: recordingId },
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
    try {
      await updater();
    } finally {
      resolveSettled();
    }
  };

  proc.on("error", (err) => {
    void finish(null, null, async () => {
      await prisma.recording.update({
        where: { id: input.recordingId },
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

export async function requestStopFfmpegRecording(
  recordingId: string,
): Promise<boolean> {
  const entry = active.get(recordingId);
  if (!entry) return false;
  entry.stopRequested = true;
  entry.proc.kill("SIGINT");
  await entry.settled;
  return true;
}
