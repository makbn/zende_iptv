import "server-only";

import { randomUUID } from "node:crypto";

import { hashStreamUrl } from "@/lib/health/url-hash";
import {
  getProxyForChannel,
  ProxyNotReadyError,
} from "@/lib/proxies/proxy-store";
import { applyPublicCorsProxyUnwrap } from "@/lib/stream/public-cors-proxy-url";
import { createStreamSession } from "@/lib/stream/stream-session-store";

import { DVR_RECORDING_SESSION_TITLE } from "./recording-session-title";

export class RecordingPrepError extends Error {
  readonly code?: string;

  constructor(message: string, readonly status: number, code?: string) {
    super(message);
    this.name = "RecordingPrepError";
    this.code = code;
  }
}

export type PreparedRecordingSource = {
  rawChannelUrl: string;
  /** HLS entry URL for ffmpeg — always this app's `/api/stream/proxy/{session}` (VPN/cookies upstream). */
  upstreamUrl: string;
  /** Opaque stream session backing the relay (same row as watch). */
  relaySessionId: string;
};

function loopbackRelayBase(): string {
  const port = process.env.PORT?.trim() || "8077";
  return `http://127.0.0.1:${port}`;
}

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
  let proxy;
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

  const relaySessionId = await createStreamSession({
    upstreamRootUrl: upstream.href,
    title: DVR_RECORDING_SESSION_TITLE,
    proxyConfig: proxy ?? undefined,
  });

  const relayBase = loopbackRelayBase();
  const upstreamUrl = `${relayBase}/api/stream/proxy/${relaySessionId}`;

  return {
    rawChannelUrl: trimmed,
    upstreamUrl,
    relaySessionId,
  };
}

export function newRecordingId(): string {
  return randomUUID();
}
