import "server-only";

import { randomUUID } from "node:crypto";

import { hashStreamUrl } from "@/lib/health/url-hash";
import {
  getProxyForChannel,
  ProxyNotReadyError,
} from "@/lib/proxies/proxy-store";
import { applyPublicCorsProxyUnwrap } from "@/lib/stream/public-cors-proxy-url";
import {
  ZENDE_INTERNAL_RELAY_HEADER,
  ZENDE_INTERNAL_RELAY_HEADER_VALUE,
} from "@/lib/stream/internal-relay-request";
import { createStreamSession } from "@/lib/stream/stream-session-store";
import { looksLikeHlsPlaylist } from "@/lib/stream/m3u8-rewrite";

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
  /** HLS/MPEG-TS entry URL for ffmpeg — always this app's `/api/stream/proxy/{session}` (VPN/cookies upstream). */
  upstreamUrl: string;
  /** Demuxer mode expected behind the relay URL. */
  inputMode: "hls" | "mpegts";
  /** Opaque stream session backing the relay (same row as watch). */
  relaySessionId: string;
};

function loopbackRelayBase(): string {
  const port = process.env.PORT?.trim() || "8077";
  return `http://127.0.0.1:${port}`;
}

/** Xtream live DVR: ffmpeg reads the MPEG-TS edge reliably; many providers return empty `.m3u8` manifests. */
export function upstreamRootForRecording(url: string): string {
  try {
    const u = new URL(url.trim());
    const m3u8 = /^(\/live\/[^/]+\/[^/]+\/\d+)\.m3u8$/i.exec(u.pathname);
    if (m3u8) {
      u.pathname = `${m3u8[1]}.ts`;
      return u.href;
    }
  } catch {
    /* ignore */
  }
  return url.trim();
}

async function verifyRecordingRelayBootstrap(
  relaySessionId: string,
  upstreamRoot: string,
): Promise<void> {
  const relayUrl = `${loopbackRelayBase()}/api/stream/proxy/${relaySessionId}`;
  const isTs = /\.ts(\?|$)/i.test(upstreamRoot);

  let res: Response;
  try {
    res = await fetch(relayUrl, {
      headers: {
        [ZENDE_INTERNAL_RELAY_HEADER]: ZENDE_INTERNAL_RELAY_HEADER_VALUE,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    throw new RecordingPrepError(
      `Could not reach the recording relay (${err instanceof Error ? err.message : "network error"}).`,
      502,
      "relay_unreachable",
    );
  }

  if (!res.ok) {
    throw new RecordingPrepError(
      `Stream is not available for recording (relay HTTP ${res.status}). Try playing the channel first or check your VPN/proxy assignment.`,
      502,
      "relay_upstream_error",
    );
  }

  if (isTs) {
    if (!res.body) {
      throw new RecordingPrepError(
        "Stream returned no MPEG-TS data for recording.",
        502,
        "empty_ts_stream",
      );
    }
    const reader = res.body.getReader();
    let chunk: Uint8Array | undefined;
    try {
      const first = await reader.read();
      chunk = first.value;
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (!chunk || chunk.length < 188 || chunk[0] !== 0x47) {
      throw new RecordingPrepError(
        "Stream returned no MPEG-TS data. The channel may be offline, geo-blocked, or the playlist URL may have expired.",
        502,
        "empty_ts_stream",
      );
    }
    return;
  }

  const text = await res.text();
  if (!looksLikeHlsPlaylist(text, res.headers.get("content-type"), upstreamRoot)) {
    throw new RecordingPrepError(
      "Stream did not return a valid HLS playlist for recording.",
      502,
      "invalid_playlist",
    );
  }
  const hasMedia = text
    .split("\n")
    .some((line) => {
      const t = line.trim();
      return (
        t.length > 0 &&
        !t.startsWith("#") &&
        (t.includes(".ts") || t.includes(".m4s") || t.startsWith("http"))
      );
    });
  if (!text.trim() || !hasMedia) {
    throw new RecordingPrepError(
      "Stream playlist is empty. The channel may be offline, geo-blocked, or the URL may have expired.",
      502,
      "empty_playlist",
    );
  }
}

export async function prepareRecordingSource(
  rawChannelUrl: string,
): Promise<PreparedRecordingSource> {
  const trimmed = rawChannelUrl.trim();
  const resolved = applyPublicCorsProxyUnwrap(trimmed, true);
  const upstreamRoot = upstreamRootForRecording(resolved);
  let upstream: URL;
  try {
    upstream = new URL(upstreamRoot);
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
    normalizeXtreamLiveUrl: false,
  });

  await verifyRecordingRelayBootstrap(relaySessionId, upstream.href);

  const relayBase = loopbackRelayBase();
  const upstreamUrl = `${relayBase}/api/stream/proxy/${relaySessionId}`;
  const inputMode = /\.ts(\?|$)/i.test(upstream.href) ? "mpegts" : "hls";

  return {
    rawChannelUrl: trimmed,
    upstreamUrl,
    inputMode,
    relaySessionId,
  };
}

export function newRecordingId(): string {
  return randomUUID();
}
