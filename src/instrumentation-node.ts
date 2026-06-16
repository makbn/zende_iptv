import "server-only";

import { createServerLogger } from "@/core/logging/server";

const log = createServerLogger("process");

export function registerNodeInstrumentation(): void {
  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
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
}
