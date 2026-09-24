import "server-only";

import { spawn } from "node:child_process";

import {
  hintAudioTracksFromCatalog,
  isMultiLangCatalogHint,
} from "@/lib/playback/audio-tracks-hint";
import type { PlaybackAudioTrack } from "@/lib/playback/stream-session-meta";
import { ffmpegCommand, isFfmpegAvailable } from "@/lib/recordings/ffmpeg-binary";

export { hintAudioTracksFromCatalog, isMultiLangCatalogHint };

function ffprobeCommand(): string {
  const ffmpeg = ffmpegCommand();
  if (/ffmpeg\.exe$/i.test(ffmpeg)) return ffmpeg.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  if (/ffmpeg$/i.test(ffmpeg)) return ffmpeg.replace(/ffmpeg$/i, "ffprobe");
  return process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
}

type FfprobeStream = {
  index?: number;
  codec_type?: string;
  tags?: { language?: string; title?: string; LANGUAGE?: string; TITLE?: string };
};

function languageLabel(code: string | undefined, fallbackIndex: number): string {
  const raw = (code ?? "").trim().toLowerCase();
  if (!raw || raw === "und" || raw === "unknown") return `Audio track ${fallbackIndex + 1}`;
  const map: Record<string, string> = {
    eng: "English",
    en: "English",
    fra: "French",
    fre: "French",
    fr: "French",
    deu: "German",
    ger: "German",
    de: "German",
    spa: "Spanish",
    es: "Spanish",
    ita: "Italian",
    it: "Italian",
    por: "Portuguese",
    pt: "Portuguese",
    ara: "Arabic",
    ar: "Arabic",
    fas: "Persian",
    per: "Persian",
    fa: "Persian",
    tur: "Turkish",
    tr: "Turkish",
    rus: "Russian",
    ru: "Russian",
    zho: "Chinese",
    chi: "Chinese",
    zh: "Chinese",
    jpn: "Japanese",
    ja: "Japanese",
    kor: "Korean",
    ko: "Korean",
    hin: "Hindi",
    hi: "Hindi",
    nld: "Dutch",
    dut: "Dutch",
    nl: "Dutch",
  };
  return map[raw] ?? raw.toUpperCase();
}

/**
 * Best-effort ffprobe of audio streams. Times out quickly so session create
 * never blocks on a slow origin. Returns [] when probe is unavailable/fails.
 */
export async function probeUpstreamAudioTracks(
  upstreamUrl: string,
  opts?: { timeoutMs?: number; headers?: string },
): Promise<PlaybackAudioTrack[]> {
  if (!isFfmpegAvailable()) return [];
  const timeoutMs = Math.max(500, opts?.timeoutMs ?? 3500);
  const args = [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    "-select_streams",
    "a",
    "-probesize",
    "4M",
    "-analyzeduration",
    "4M",
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
      resolve([]);
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (stdout.length > 1_000_000) child.kill("SIGKILL");
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout) as { streams?: FfprobeStream[] };
        const audio = (parsed.streams ?? []).filter((s) => s.codec_type === "audio");
        if (audio.length === 0) {
          resolve([]);
          return;
        }
        resolve(
          audio.map((stream, i) => {
            const language =
              stream.tags?.language?.trim() ||
              stream.tags?.LANGUAGE?.trim() ||
              undefined;
            const title = stream.tags?.title?.trim() || stream.tags?.TITLE?.trim();
            return {
              index: i,
              label: title || languageLabel(language, i),
              ...(language ? { language: language.toLowerCase() } : {}),
            };
          }),
        );
      } catch {
        resolve([]);
      }
    });
  });
}

/** Prefer probed tracks; fall back to MULTI-LANG catalog hints. */
export async function resolvePlaybackAudioTracks(input: {
  upstreamUrl: string;
  group?: string | null;
  title?: string | null;
  existing?: PlaybackAudioTrack[];
  headers?: string;
}): Promise<PlaybackAudioTrack[] | undefined> {
  if (input.existing && input.existing.length > 1) return input.existing;

  const shouldProbe =
    isMultiLangCatalogHint(input.group, input.title) ||
    /\/movie\/|\/series\//i.test(input.upstreamUrl);

  if (shouldProbe) {
    const probed = await probeUpstreamAudioTracks(input.upstreamUrl, {
      timeoutMs: 3500,
      headers: input.headers,
    });
    if (probed.length > 1) return probed;
  }

  return hintAudioTracksFromCatalog(input.group, input.title);
}
