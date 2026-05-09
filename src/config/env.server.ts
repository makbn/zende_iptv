import "server-only";
import { z } from "zod";

const logLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
]);

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: logLevelSchema.default("info"),
  /** Optional. Public origin for HLS rewrite (e.g. https://live.example.com). See getRequestOrigin. */
  PUBLIC_APP_URL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type LogLevelSetting = z.infer<typeof logLevelSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
  });
  return cached;
}
