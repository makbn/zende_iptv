import "server-only";

import pino, { type Logger } from "pino";

import { getServerEnv } from "@/config/env.server";

import { PinoLoggerAdapter } from "./adapters/pino-logger";
import { RotatingFileDestination } from "./rotating-file-destination";
import type { ILogger } from "./types";

const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

/** Human-readable one-liner for `docker logs` (production has no pino-pretty). */
function createDockerLogDestination(): pino.DestinationStream {
  return {
    write(chunk: string | Uint8Array) {
      const raw = String(chunk).trim();
      if (!raw) return;
      try {
        const o = JSON.parse(raw) as Record<string, unknown>;
        const ts = typeof o.time === "string" ? o.time : new Date().toISOString();
        const levelNum = typeof o.level === "number" ? o.level : 30;
        const level = LEVEL_NAMES[levelNum] ?? "INFO";
        const scope = typeof o.scope === "string" ? o.scope : "";
        const msg = typeof o.msg === "string" ? o.msg : "";
        const extra: Record<string, unknown> = { ...o };
        for (const key of ["time", "level", "msg", "scope", "pid", "hostname", "service"]) {
          delete extra[key];
        }
        const suffix =
          Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
        const line = `${ts} [${level}]${scope ? ` ${scope}` : ""} ${msg}${suffix}\n`;
        if (levelNum >= 50) process.stderr.write(line);
        else process.stdout.write(line);
      } catch {
        process.stdout.write(`${raw}\n`);
      }
    },
  };
}

function shouldUsePrettyTransport(env: ReturnType<typeof getServerEnv>): boolean {
  if (env.LOG_PRETTY) return true;
  return env.NODE_ENV === "development" && env.LOG_LEVEL !== "silent";
}

type RootLoggers = {
  main: Logger;
  errors?: Logger;
};

function createRootLoggers(): RootLoggers {
  const env = getServerEnv();
  const isDev = env.NODE_ENV === "development";
  let main: Logger | undefined;

  if (shouldUsePrettyTransport(env)) {
    try {
      main = pino({
        level: env.LOG_LEVEL,
        base: { service: "zende" },
        transport: {
          target: "pino-pretty",
          options: {
            colorize: isDev,
            translateTime: "SYS:standard",
            ignore: "pid,hostname,service",
          },
        },
      });
    } catch {
      // pino-pretty missing — fall through to docker stream.
    }
  }

  main ??= pino(
    { level: env.LOG_LEVEL, base: { service: "zende" } },
    createDockerLogDestination(),
  );

  if (env.LOG_LEVEL === "silent" || !env.LOG_ERROR_FILE) return { main };

  try {
    const destination = new RotatingFileDestination({
      filePath: env.LOG_ERROR_FILE,
      maxBytes: env.LOG_ERROR_MAX_BYTES,
      maxFiles: env.LOG_ERROR_MAX_FILES,
    });
    const errors = pino(
      { level: "error", base: { service: "zende" } },
      destination,
    );
    return { main, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `Unable to initialize dedicated error log ${env.LOG_ERROR_FILE}: ${message}\n`,
    );
    return { main };
  }
}

let roots: RootLoggers | null = null;

function getRootLoggers(): RootLoggers {
  if (!roots) roots = createRootLoggers();
  return roots;
}

/** Server-only factory: use in Route Handlers, Server Actions, and Server Components. */
export function createServerLogger(scope: string): ILogger {
  const { main, errors } = getRootLoggers();
  return new PinoLoggerAdapter(main, scope, undefined, errors);
}
