import "server-only";

import type { ILogger } from "./types";
import { createServerLogger } from "./server";

export function createApiLogger(scope: string, request: Request): ILogger {
  const url = new URL(request.url);
  return createServerLogger(scope).child({
    method: request.method,
    path: url.pathname,
  });
}

/**
 * Wrap an API handler with start/done/error lines — shows up in `docker logs`.
 */
export async function withApiLogging(
  scope: string,
  request: Request,
  handler: (log: ILogger) => Promise<Response>,
): Promise<Response> {
  const log = createApiLogger(scope, request);
  const started = Date.now();
  log.info("request start");
  try {
    const response = await handler(log);
    const status = response.status;
    const elapsedMs = Date.now() - started;
    if (status >= 500) {
      log.error("request done", { status, elapsedMs });
    } else if (status >= 400) {
      log.warn("request done", { status, elapsedMs });
    } else {
      log.info("request done", { status, elapsedMs });
    }
    return response;
  } catch (err) {
    log.error("request failed", {
      elapsedMs: Date.now() - started,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}
