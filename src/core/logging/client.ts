import { getPublicEnv } from "@/config/env.public";

import { BrowserLoggerAdapter } from "./adapters/browser-logger";
import type { ILogger } from "./types";

/** Browser-safe factory (bundle excludes Pino). Use inside Client Components or shared utilities called from the client. */
export function createClientLogger(scope: string): ILogger {
  const { NEXT_PUBLIC_LOG_LEVEL } = getPublicEnv();
  const level = NEXT_PUBLIC_LOG_LEVEL ?? "info";
  return new BrowserLoggerAdapter(scope, level);
}
