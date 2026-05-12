import "server-only";

import { randomUUID } from "node:crypto";

import { hashStreamUrl } from "@/lib/health/url-hash";
import {
  getProxyForChannel,
  ProxyNotReadyError,
  type StoredProxyConfig,
} from "@/lib/proxies/proxy-store";
import { applyPublicCorsProxyUnwrap } from "@/lib/stream/public-cors-proxy-url";

import { httpProxyUrlForFfmpeg } from "./ffmpeg-proxy";

export class RecordingPrepError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RecordingPrepError";
  }
}

export type PreparedRecordingSource = {
  rawChannelUrl: string;
  upstreamUrl: string;
  httpProxy?: string;
};

export async function prepareRecordingSource(
  rawChannelUrl: string,
): Promise<PreparedRecordingSource> {
  const trimmed = rawChannelUrl.trim();
  const resolved = applyPublicCorsProxyUnwrap(trimmed, true);
  let upstream: URL;
  try {
    upstream = new URL(resolved);
  } catch {
    throw new RecordingPrepError("Invalid stream URL.", 400);
  }
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    throw new RecordingPrepError("Only http(s) streams can be recorded.", 400);
  }

  const urlHash = await hashStreamUrl(trimmed);
  let proxy: StoredProxyConfig | null;
  try {
    proxy = await getProxyForChannel(urlHash);
  } catch (err) {
    if (err instanceof ProxyNotReadyError) {
      throw new RecordingPrepError(err.message, 409);
    }
    throw err;
  }

  if (proxy?.vpnType === "smartdns") {
    throw new RecordingPrepError(
      "This channel uses Smart DNS routing. Recording requires a direct HTTP/S proxy or no proxy — reassign the channel or pick another stream.",
      409,
    );
  }

  const httpProxy = httpProxyUrlForFfmpeg(proxy);

  return {
    rawChannelUrl: trimmed,
    upstreamUrl: upstream.href,
    ...(httpProxy ? { httpProxy } : {}),
  };
}

export function newRecordingId(): string {
  return randomUUID();
}
