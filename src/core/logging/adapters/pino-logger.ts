import "server-only";

import type { Logger as PinoRootLogger } from "pino";
import type { ILogger, LogContext } from "../types";

function mergeContext(
  scope: string,
  base: LogContext | undefined,
  extra?: LogContext,
): LogContext {
  return { scope, ...base, ...extra };
}

/**
 * Adapter: maps {@link ILogger} to Pino (Single Responsibility).
 */
export class PinoLoggerAdapter implements ILogger {
  constructor(
    private readonly pino: PinoRootLogger,
    readonly scope: string,
    private readonly baseContext?: LogContext,
  ) {}

  trace(message: string, context?: LogContext): void {
    this.pino.trace(mergeContext(this.scope, this.baseContext, context), message);
  }

  debug(message: string, context?: LogContext): void {
    this.pino.debug(mergeContext(this.scope, this.baseContext, context), message);
  }

  info(message: string, context?: LogContext): void {
    this.pino.info(mergeContext(this.scope, this.baseContext, context), message);
  }

  warn(message: string, context?: LogContext): void {
    this.pino.warn(mergeContext(this.scope, this.baseContext, context), message);
  }

  error(message: string, context?: LogContext): void {
    this.pino.error(mergeContext(this.scope, this.baseContext, context), message);
  }

  fatal(message: string, context?: LogContext): void {
    this.pino.fatal(mergeContext(this.scope, this.baseContext, context), message);
  }

  child(bindings: LogContext): ILogger {
    return new PinoLoggerAdapter(this.pino, this.scope, {
      ...this.baseContext,
      ...bindings,
    });
  }
}
