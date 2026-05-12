/**
 * Server-side ffmpeg (and similar) hits `/api/stream/proxy/...` on loopback. We send this
 * header so `getRequestOrigin` rewrites child playlist URLs to the same origin as the
 * incoming request — not `PUBLIC_APP_URL`, which may be unreachable from inside the container.
 */
export const ZENDE_INTERNAL_RELAY_HEADER = "x-zende-relay-internal";
export const ZENDE_INTERNAL_RELAY_HEADER_VALUE = "1";

export function isInternalRelayRequest(request: Request): boolean {
  return (
    request.headers.get(ZENDE_INTERNAL_RELAY_HEADER) ===
    ZENDE_INTERNAL_RELAY_HEADER_VALUE
  );
}

/** Value for ffmpeg `-headers` (CRLF-terminated lines). */
export function internalRelayFfmpegHeadersBlock(): string {
  return `${ZENDE_INTERNAL_RELAY_HEADER}: ${ZENDE_INTERNAL_RELAY_HEADER_VALUE}\r\n`;
}
