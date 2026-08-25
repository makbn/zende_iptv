import "server-only";

import { createServerLogger } from "@/core/logging/server";

const log = createServerLogger("process");

export function registerNodeInstrumentation(): void {
  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", {
      message: reason instanceof Error ? reason.message : String(reason),
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
