import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getJwtSecretBytes } from "@/lib/auth/jwt-secret";

/**
 * Server-side ffmpeg (and similar) hits `/api/stream/proxy/...` on loopback. We send this
 * header so `getRequestOrigin` rewrites child playlist URLs to the same origin as the
 * incoming request — not `PUBLIC_APP_URL`, which may be unreachable from inside the container.
 */
export const ZENDE_INTERNAL_RELAY_HEADER = "x-zende-relay-internal";

function internalRelayToken(): string {
  return createHmac("sha256", getJwtSecretBytes())
    .update("zende-internal-stream-relay-v1")
    .digest("base64url");
}

/** Server-only value used by in-process probes and relay tests. */
export function internalRelayHeaderValue(): string {
  return internalRelayToken();
}

function isLoopbackRequest(request: Request): boolean {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
  } catch {
    return false;
  }
}

export function isInternalRelayRequest(request: Request): boolean {
  if (!isLoopbackRequest(request)) return false;
  const supplied = request.headers.get(ZENDE_INTERNAL_RELAY_HEADER);
  if (!supplied) return false;
  const expected = internalRelayHeaderValue();
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(suppliedBytes, expectedBytes);
}

/** Value for ffmpeg `-headers` (CRLF-terminated lines). */
export function internalRelayFfmpegHeadersBlock(): string {
  return `${ZENDE_INTERNAL_RELAY_HEADER}: ${internalRelayHeaderValue()}\r\n`;
}
