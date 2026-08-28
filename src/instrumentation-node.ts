import "server-only";

import { createServerLogger } from "@/core/logging/server";

const log = createServerLogger("process");

type RequestErrorContext = {
  method?: string;
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
  revalidateReason?: string;
  renderType?: string;
};

export function reportRequestError(
  error: unknown,
  context: RequestErrorContext,
): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;

  log.error("next request error", {
    message: normalized.message,
    stack: normalized.stack,
    digest,
    ...context,
  });
}

export function registerNodeInstrumentation(): void {
  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    log.error("unhandledRejection", {
      message: error.message,
      stack: error.stack,
    });
  });

  process.on("uncaughtException", (err) => {
    log.fatal("uncaughtException", {
      message: err.message,
      stack: err.stack,
    });
  });

  log.info("instrumentation registered", {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL ?? "info",
  });

  // Threadfin bootstrap is triggered from /api/health (not here): webpack cannot
  // bundle node:fs / prisma into the instrumentation graph.
  const syncEnabled = (() => {
    const v = (process.env.ZENDE_THREADFIN_SYNC ?? "1").trim().toLowerCase();
    return v !== "0" && v !== "false" && v !== "no";
  })();
  if (syncEnabled) {
    log.info("threadfin sync enabled — will bootstrap on first health check");
  }
}
