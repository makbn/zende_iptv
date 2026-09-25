import "server-only";

import { spawn } from "node:child_process";

import { ffmpegCommand, isFfmpegAvailable } from "@/lib/recordings/ffmpeg-binary";

function ffprobeCommand(): string {
  const ffmpeg = ffmpegCommand();
  if (/ffmpeg\.exe$/i.test(ffmpeg)) return ffmpeg.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  if (/ffmpeg$/i.test(ffmpeg)) return ffmpeg.replace(/ffmpeg$/i, "ffprobe");
  return process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
}

type FfprobeVideoStream = {
  codec_type?: string;
  pix_fmt?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  profile?: string;
  bits_per_raw_sample?: string;
  side_data_list?: Array<{ side_data_type?: string }>;
};

const HDR_SIDE_DATA = /mastering display|content light level|hdr|dolby vision/i;

export type HdrToneMapKind = "pq" | "hlg" | "bt2020";

export type VideoColorProbe = {
  needsToneMap: boolean;
  kind: HdrToneMapKind | null;
};

/**
 * Classify whether the primary video stream needs HDR→SDR tone-mapping
 * for accurate Rec.709 delivery (not a saturation boost).
 */
export function classifyVideoHdrToneMap(
  stream: FfprobeVideoStream | null | undefined,
): VideoColorProbe {
  if (!stream || stream.codec_type !== "video") {
    return { needsToneMap: false, kind: null };
  }
  const transfer = (stream.color_transfer ?? "").toLowerCase();
  if (transfer === "smpte2084" || transfer === "smpte428") {
    return { needsToneMap: true, kind: "pq" };
  }
  if (transfer === "arib-std-b67") {
    return { needsToneMap: true, kind: "hlg" };
  }
  const primaries = (stream.color_primaries ?? "").toLowerCase();
  const space = (stream.color_space ?? "").toLowerCase();
  const sides = stream.side_data_list ?? [];
  if (sides.some((s) => HDR_SIDE_DATA.test(s.side_data_type ?? ""))) {
    return { needsToneMap: true, kind: "pq" };
  }
  if (
    (primaries.includes("2020") || space.includes("2020")) &&
    /p10|p12|p16/.test(stream.pix_fmt ?? "")
  ) {
    return { needsToneMap: true, kind: "bt2020" };
  }
  return { needsToneMap: false, kind: null };
}

/** @deprecated Prefer classifyVideoHdrToneMap for transfer-aware filters. */
export function videoStreamNeedsHdrToneMap(
  stream: FfprobeVideoStream | null | undefined,
): boolean {
  return classifyVideoHdrToneMap(stream).needsToneMap;
}

/**
 * Best-effort HDR classification for progressive compatibility encodes.
 * Returns no tone-map when probe is unavailable so SDR paths stay untouched.
 */
export async function probeUpstreamVideoColor(
  upstreamUrl: string,
  opts?: { timeoutMs?: number; headers?: string },
): Promise<VideoColorProbe> {
  if (!isFfmpegAvailable()) return { needsToneMap: false, kind: null };
  const timeoutMs = Math.max(500, opts?.timeoutMs ?? 4000);
  const args = [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    "-select_streams",
    "v:0",
    "-probesize",
    "8M",
    "-analyzeduration",
    "6M",
  ];
  if (opts?.headers?.trim()) {
    args.push("-headers", opts.headers);
  }
  args.push(upstreamUrl);

  return await new Promise((resolve) => {
    const child = spawn(ffprobeCommand(), args, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ needsToneMap: false, kind: null });
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (stdout.length > 1_000_000) child.kill("SIGKILL");
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ needsToneMap: false, kind: null });
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout) as { streams?: FfprobeVideoStream[] };
        resolve(classifyVideoHdrToneMap(parsed.streams?.[0]));
      } catch {
        resolve({ needsToneMap: false, kind: null });
      }
    });
  });
}

export async function probeUpstreamNeedsHdrToneMap(
  upstreamUrl: string,
  opts?: { timeoutMs?: number; headers?: string },
): Promise<boolean> {
  return (await probeUpstreamVideoColor(upstreamUrl, opts)).needsToneMap;
}

let zscaleSupport: Promise<boolean> | null = null;

/** Cached check — Homebrew FFmpeg often omits libzimg/`zscale`. */
export function ffmpegSupportsZscale(): Promise<boolean> {
  if (!zscaleSupport) {
    zscaleSupport = new Promise((resolve) => {
      if (!isFfmpegAvailable()) {
        resolve(false);
        return;
      }
      const child = spawn(ffmpegCommand(), ["-hide_banner", "-filters"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let out = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(false);
      }, 2500);
      child.stdout?.on("data", (chunk: Buffer | string) => {
        out += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        if (out.length > 400_000) child.kill("SIGKILL");
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on("close", () => {
        clearTimeout(timer);
        resolve(/\bzscale\b/.test(out));
      });
    });
  }
  return zscaleSupport;
}
