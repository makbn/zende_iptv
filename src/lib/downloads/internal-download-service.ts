import "server-only";

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { createServerLogger } from "@/core/logging/server";
import { hashStreamUrl } from "@/lib/health/url-hash";
import { getProxyForChannel, ProxyNotReadyError } from "@/lib/proxies/proxy-store";
import { ffmpegCommand } from "@/lib/recordings/ffmpeg-binary";
import { applyPublicCorsProxyUnwrap } from "@/lib/stream/public-cors-proxy-url";
import {
  internalRelayFfmpegHeadersBlock,
} from "@/lib/stream/internal-relay-request";
import { createStreamSession } from "@/lib/stream/stream-session-store";
import { loadInternalDownloadSettings } from "@/lib/downloads/internal-download-settings";

const log = createServerLogger("lib.downloads.internal");
const activeTargets = new Set<string>();

function relayBase(): string {
  return `http://127.0.0.1:${process.env.PORT?.trim() || "8077"}`;
}

export function safeMediaFileStem(title: string): string {
  const cleaned = title
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 140)
    .trim();
  return cleaned || "Movie";
}

async function reserveTarget(directory: string, title: string): Promise<{ target: string; partial: string }> {
  const stem = safeMediaFileStem(title);
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const fileName = `${stem}${suffix ? ` (${suffix + 1})` : ""}.mp4`;
    const target = path.join(directory, fileName);
    if (activeTargets.has(target)) continue;
    try {
      await fs.access(target);
    } catch {
      activeTargets.add(target);
      return { target, partial: `${target}.part` };
    }
  }
  throw new Error("Could not allocate a unique download filename.");
}

export async function startInternalDownload(input: {
  url: string;
  title: string;
}): Promise<{ id: string; fileName: string; directoryPath: string }> {
  const settings = await loadInternalDownloadSettings();
  if (!settings.configured || !settings.directoryPath) {
    throw new Error("Choose an internal download directory in web Settings first.");
  }
  const resolvedUrl = applyPublicCorsProxyUnwrap(input.url.trim(), true);
  const upstream = new URL(resolvedUrl);
  if (!/^https?:$/.test(upstream.protocol)) throw new Error("Only HTTP(S) movies and episodes can be downloaded.");
  if (resolvedUrl.startsWith("zende://")) throw new Error("Choose an episode before downloading a series.");

  let proxy;
  try {
    proxy = await getProxyForChannel(await hashStreamUrl(input.url.trim()));
  } catch (error) {
    if (error instanceof ProxyNotReadyError) throw new Error(error.message);
    throw error;
  }
  const id = randomUUID();
  const sessionId = await createStreamSession({
    upstreamRootUrl: upstream.href,
    title: `Internal download ${id}`,
    proxyConfig: proxy ?? undefined,
    normalizeXtreamLiveUrl: false,
  });
  const { target, partial } = await reserveTarget(settings.directoryPath, input.title);
  await fs.rm(partial, { force: true });

  const isHls = /\.m3u8(?:$|[?#])/i.test(upstream.href);
  const args = [
    "-hide_banner", "-loglevel", "warning", "-nostats",
    "-rw_timeout", "180000000",
    "-user_agent", "Zende internal downloader",
    "-headers", internalRelayFfmpegHeadersBlock(),
    "-protocol_whitelist", "file,http,https,tcp,tls,crypto,data",
    "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "30",
    ...(isHls
      ? ["-allowed_extensions", "ALL", "-allowed_segment_extensions", "ALL", "-extension_picky", "0"]
      : []),
    "-i", `${relayBase()}/api/stream/proxy/${sessionId}`,
    "-map", "0:v:0?", "-map", "0:a?",
    "-c:v", "copy", "-c:a", "copy", "-bsf:a", "aac_adtstoasc",
    "-movflags", "+faststart", "-max_muxing_queue_size", "4096",
    "-f", "mp4", "-y", partial,
  ];
  const child = spawn(ffmpegCommand(), args, { stdio: ["ignore", "ignore", "pipe"], detached: false });
  let stderrTail = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-3000);
  });
  let finished = false;
  const finish = async (ok: boolean) => {
    if (finished) return;
    finished = true;
    try {
      const size = await fs.stat(partial).then((stat) => stat.size).catch(() => 0);
      if (ok && size > 0) {
        await fs.rename(partial, target);
        log.info("internal download completed", { id, fileName: path.basename(target), sizeBytes: size });
      } else {
        await fs.rm(partial, { force: true });
        log.error("internal download failed", { id, fileName: path.basename(target), stderr: stderrTail });
      }
    } finally {
      activeTargets.delete(target);
    }
  };
  child.once("error", (error) => {
    stderrTail = error.message;
    void finish(false);
  });
  child.once("close", (code) => void finish(code === 0));

  return { id, fileName: path.basename(target), directoryPath: settings.directoryPath };
}
