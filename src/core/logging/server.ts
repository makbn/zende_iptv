import "server-only";

import pino, { type Logger } from "pino";

import { getServerEnv } from "@/config/env.server";

import { PinoLoggerAdapter } from "./adapters/pino-logger";
import type { ILogger } from "./types";

function createRootLogger(): Logger {
  const env = getServerEnv();
  const isDev = env.NODE_ENV === "development";

  return pino({
    level: env.LOG_LEVEL,
    ...(isDev && env.LOG_LEVEL !== "silent"
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
  });
}

let root: Logger | null = null;

function getRootLogger(): Logger {
  if (!root) root = createRootLogger();
  return root;
}

/** Server-only factory: use in Route Handlers, Server Actions, and Server Components. */
export function createServerLogger(scope: string): ILogger {
  return new PinoLoggerAdapter(getRootLogger(), scope);
}
