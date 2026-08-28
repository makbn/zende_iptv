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
  /** When true, use pino-pretty (dev default). Production Docker sets this via compose. */
  LOG_PRETTY: z
    .enum(["0", "1", "false", "true"])
    .optional()
    .transform((v) => v === "1" || v === "true")
    .default(false),
  /** JSON Lines file containing only error/fatal events. Empty disables it. */
  LOG_ERROR_FILE: z.string().trim().default("logs/errors.ndjson"),
  /** Rotate the error file before the next event would exceed this size. */
  LOG_ERROR_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1024 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  /** Total error files retained, including the active file. */
  LOG_ERROR_MAX_FILES: z.coerce.number().int().min(1).max(20).default(5),
  /** Optional. Public origin for HLS rewrite (e.g. https://live.example.com). See getRequestOrigin. */
  PUBLIC_APP_URL: z.string().optional(),
  /** Wyzie Subs API key for VOD subtitle search (https://sub.wyzie.io). */
  WYZIE_API_KEY: z.string().optional(),
  /** TMDB API key for resolving movie/show titles to ids (https://developer.themoviedb.org). */
  TMDB_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type LogLevelSetting = z.infer<typeof logLevelSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_PRETTY: process.env.LOG_PRETTY,
    LOG_ERROR_FILE: process.env.LOG_ERROR_FILE,
    LOG_ERROR_MAX_BYTES: process.env.LOG_ERROR_MAX_BYTES,
    LOG_ERROR_MAX_FILES: process.env.LOG_ERROR_MAX_FILES,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    WYZIE_API_KEY: process.env.WYZIE_API_KEY,
    TMDB_API_KEY: process.env.TMDB_API_KEY,
  });
  return cached;
}
