import type { ILogger, LogContext, LogLevelName } from "../types";

const LEVEL_ORDER: Record<LogLevelName, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function shouldLog(
  configured: LogLevelName | "silent",
  level: LogLevelName,
): boolean {
  if (configured === "silent") return false;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configured];
}

function formatPayload(
  scope: string,
  level: LogLevelName,
  message: string,
  context?: LogContext,
): LogContext {
  return {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...context,
  };
}

/**
 * Structured browser logging for debugging without pulling Pino into the bundle.
 * Swap for a remote sink later by implementing {@link ILogger} (Open/Closed).
 */
export class BrowserLoggerAdapter implements ILogger {
  constructor(
    readonly scope: string,
    private readonly minLevel: LogLevelName | "silent" = "info",
    private readonly baseContext?: LogContext,
  ) {}

  private emit(level: LogLevelName, message: string, context?: LogContext): void {
    if (!shouldLog(this.minLevel, level)) return;
    const payload = formatPayload(this.scope, level, message, {
      ...this.baseContext,
      ...context,
    });
    const line = `[${payload.ts}] [${level}] [${this.scope}] ${message}`;
    switch (level) {
      case "trace":
      case "debug":
        console.debug(line, payload);
        break;
      case "info":
        console.info(line, payload);
        break;
      case "warn":
        console.warn(line, payload);
        break;
      case "error":
      case "fatal":
        console.error(line, payload);
        break;
      default:
        console.log(line, payload);
    }
  }

  trace(message: string, context?: LogContext): void {
    this.emit("trace", message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.emit("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.emit("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.emit("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.emit("error", message, context);
  }

  fatal(message: string, context?: LogContext): void {
    this.emit("fatal", message, context);
  }

  child(bindings: LogContext): ILogger {
    return new BrowserLoggerAdapter(this.scope, this.minLevel, {
      ...this.baseContext,
      ...bindings,
    });
  }
}
