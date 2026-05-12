import "server-only";

import { spawnSync } from "node:child_process";

export function ffmpegCommand(): string {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

export function isFfmpegAvailable(): boolean {
  const cmd = ffmpegCommand();
  const r = spawnSync(cmd, ["-version"], { encoding: "utf-8" });
  return r.status === 0;
}
