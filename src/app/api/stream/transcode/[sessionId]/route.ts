import { createServerLogger } from "@/core/logging/server";
import {
  ensureHlsTranscodeJob,
  readHlsPlaylist,
  readHlsSegment,
} from "@/lib/stream/hls-transcode-manager";
import { internalRelayFfmpegHeadersBlock } from "@/lib/stream/internal-relay-request";
import { isProgressiveMediaUrl } from "@/lib/stream/playback-url";
import { buildProgressiveVodPlaylist } from "@/lib/stream/progressive-transcode";
import { touchSession } from "@/lib/stream/stream-session-store";
import { authorizeStreamSession } from "@/lib/stream/stream-session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createServerLogger("api.stream.transcode");

function parseAsset(raw: string):
  | { kind: "playlist"; sessionId: string }
  | { kind: "segment"; sessionId: string; segmentNumber: string }
  | null {
  const playlist = /^([A-Za-z0-9_-]{8,128})\.m3u8$/.exec(raw);
  if (playlist) return { kind: "playlist", sessionId: playlist[1]! };
  const segment = /^([A-Za-z0-9_-]{8,128})-(\d{6})\.ts$/.exec(raw);
  if (segment) {
    return {
      kind: "segment",
      sessionId: segment[1]!,
      segmentNumber: segment[2]!,
    };
  }
  return null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId: rawAsset } = await context.params;
  const asset = parseAsset(rawAsset);
  if (!asset) {
    return Response.json({ error: "Unknown compatibility asset." }, { status: 404 });
  }

  const session = await touchSession(asset.sessionId);
  if (!session) {
    return Response.json({ error: "Unknown or expired session." }, { status: 404 });
  }
  const authorizationFailure = await authorizeStreamSession(
    request,
    session,
    asset.sessionId,
  );
  if (authorizationFailure) return authorizationFailure;
  if (!isProgressiveMediaUrl(session.upstreamRootUrl)) {
    return Response.json({ error: "This stream is not progressive media." }, { status: 415 });
  }

  const port = Number.parseInt(process.env.PORT ?? "8077", 10) || 8077;
  const inputUrl =
    `http://127.0.0.1:${port}/api/stream/proxy/${encodeURIComponent(asset.sessionId)}.mkv`;
  const durationSeconds =
    session.meta.contentKind !== "live" &&
    session.meta.durationSeconds != null &&
    Number.isFinite(session.meta.durationSeconds) &&
    session.meta.durationSeconds > 0
      ? session.meta.durationSeconds
      : undefined;

  try {
    if (asset.kind === "playlist" && durationSeconds) {
      return new Response(
        buildProgressiveVodPlaylist(asset.sessionId, durationSeconds),
        {
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "private, no-store",
            "X-Accel-Buffering": "no",
            "X-Zende-Transcoded": "hevc-mkv-to-h264-hls-vod",
            "X-Zende-Duration-Seconds": String(durationSeconds),
          },
        },
      );
    }

    const job = await ensureHlsTranscodeJob({
      sessionId: asset.sessionId,
      inputUrl,
      internalHeaders: internalRelayFfmpegHeadersBlock(),
      ...(asset.kind === "segment" && durationSeconds
        ? {
            durationSeconds,
            targetSegment: Number(asset.segmentNumber),
          }
        : {}),
    });

    if (asset.kind === "segment") {
      const body = await readHlsSegment(job, asset.segmentNumber);
      if (!body) return new Response(null, { status: 404 });
      if (Number(asset.segmentNumber) < 3 || Number(asset.segmentNumber) % 10 === 0) {
        log.info("compatibility segment served", {
          sessionId: asset.sessionId,
          segmentNumber: asset.segmentNumber,
          bytes: body.byteLength,
        });
      }
      const responseBody = Uint8Array.from(body).buffer;
      return new Response(responseBody, {
        headers: {
          "Content-Type": "video/mp2t",
          "Content-Length": String(body.byteLength),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const playlist = (await readHlsPlaylist(job)).replace(
      /^segment-(\d{6})\.ts$/gm,
      `/api/stream/transcode/${asset.sessionId}-$1.ts`,
    );
    return new Response(playlist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "private, no-store",
        "X-Accel-Buffering": "no",
        "X-Zende-Transcoded": "hevc-mkv-to-h264-hls",
      },
    });
  } catch (error) {
    log.error("segmented compatibility stream unavailable", {
      sessionId: asset.sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Compatibility stream could not start." },
      { status: 502 },
    );
  }
}
