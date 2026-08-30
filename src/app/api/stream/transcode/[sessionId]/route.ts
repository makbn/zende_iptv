import { spawn } from "node:child_process";
import { Readable } from "node:stream";

import { createServerLogger } from "@/core/logging/server";
import { ffmpegCommand } from "@/lib/recordings/ffmpeg-binary";
import { internalRelayFfmpegHeadersBlock } from "@/lib/stream/internal-relay-request";
import { buildProgressiveTranscodeArgs } from "@/lib/stream/progressive-transcode";
import { isProgressiveMediaUrl } from "@/lib/stream/playback-url";
import { touchSession } from "@/lib/stream/stream-session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createServerLogger("api.stream.transcode");

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId: rawSessionId } = await context.params;
  const sessionId = rawSessionId.replace(/\.mp4$/i, "");
  const session = await touchSession(sessionId);
  if (!session) {
    return Response.json({ error: "Unknown or expired session." }, { status: 404 });
  }
  if (!isProgressiveMediaUrl(session.upstreamRootUrl)) {
    return Response.json({ error: "This stream is not progressive media." }, { status: 415 });
  }

  const port = Number.parseInt(process.env.PORT ?? "8077", 10) || 8077;
  const inputUrl = `http://127.0.0.1:${port}/api/stream/proxy/${encodeURIComponent(sessionId)}.mkv`;
  const startedAt = Date.now();
  const proc = spawn(
    ffmpegCommand(),
    buildProgressiveTranscodeArgs(inputUrl, internalRelayFfmpegHeadersBlock()),
    { stdio: ["ignore", "pipe", "pipe"], detached: false },
  );

  let stderrTail = "";
  proc.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-4000);
  });

  let clientClosed = false;
  const stop = () => {
    clientClosed = true;
    if (!proc.killed) proc.kill("SIGTERM");
  };
  request.signal.addEventListener("abort", stop, { once: true });

  proc.once("spawn", () => {
    log.info("progressive compatibility transcode started", {
      sessionId,
      inputContainer: "mkv",
      outputVideo: "h264",
      outputAudio: "aac-stereo",
    });
  });
  proc.once("error", (error) => {
    log.error("progressive compatibility transcode failed to start", {
      sessionId,
      message: error.message,
    });
  });
  proc.once("close", (code, signal) => {
    request.signal.removeEventListener("abort", stop);
    const details = {
      sessionId,
      code,
      signal,
      clientClosed,
      elapsedMs: Date.now() - startedAt,
      stderr: stderrTail.trim().slice(-1200) || undefined,
    };
    if (clientClosed || code === 0) {
      log.info("progressive compatibility transcode stopped", details);
    } else {
      log.warn("progressive compatibility transcode exited early", details);
    }
  });

  const body = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Accel-Buffering": "no",
      "X-Zende-Transcoded": "hevc-mkv-to-h264-mp4",
    },
  });
}
