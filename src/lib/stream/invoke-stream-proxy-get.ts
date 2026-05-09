import "server-only";

import { GET as streamProxyGet } from "@/app/api/stream/proxy/[sessionId]/route";

/**
 * Runs the stream-proxy Route Handler in-process (no loopback HTTP).
 * Self-fetch to `/api/stream/proxy` from `/live/…` was brittle behind Docker/reverse proxies
 * and produced no logs when the connection failed before hitting the proxy.
 */
export async function invokeStreamProxyGet(
  request: Request,
  sessionId: string,
): Promise<Response> {
  return streamProxyGet(request, {
    params: Promise.resolve({ sessionId }),
  });
}
