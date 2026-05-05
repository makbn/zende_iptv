/**
 * Logging contracts (Dependency Inversion): application code should depend on
 * {@link ILogger}, not on Pino or `console` directly.
 */

export type LogLevelName =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

export type LogContext = Record<string, unknown>;

export interface ILogger {
  readonly scope: string;

  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  fatal(message: string, context?: LogContext): void;

  /** Narrow logging with bound context (Open/Closed: extend behavior without changing callers). */
  child(bindings: LogContext): ILogger;
}
