import "server-only";

import { createHmac } from "node:crypto";

import { PLEX_CHANNEL_LIMIT } from "@/lib/threadfin/plex-selection";

/** Fixed portal username Threadfin uses to pull Zende M3U/EPG. */
export const THREADFIN_PORTAL_USERNAME = "threadfin";

export function isThreadfinSyncEnabled(): boolean {
  const v = (process.env.ZENDE_THREADFIN_SYNC ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

export function threadfinInternalUrl(): string {
  return (process.env.ZENDE_THREADFIN_URL ?? "http://threadfin:34400").replace(/\/$/, "");
}

export function threadfinSourceOrigin(): string {
  return (process.env.ZENDE_THREADFIN_SOURCE_ORIGIN ?? "http://zende:8077").replace(/\/$/, "");
}

export function threadfinConfDir(): string {
  return (process.env.ZENDE_THREADFIN_CONF_DIR ?? "/threadfin-conf").trim() || "/threadfin-conf";
}

export function threadfinMaxChannels(): number {
  const n = Number.parseInt(
    process.env.ZENDE_THREADFIN_MAX_CHANNELS ?? String(PLEX_CHANNEL_LIMIT),
    10,
  );
  if (!Number.isFinite(n) || n < 1) return PLEX_CHANNEL_LIMIT;
  return Math.min(n, PLEX_CHANNEL_LIMIT);
}

export function threadfinTunerCount(): number {
  const n = Number.parseInt(process.env.ZENDE_THREADFIN_TUNER_COUNT ?? "4", 10);
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.min(n, 32);
}

export function threadfinPublicPort(): number {
  const n = Number.parseInt(process.env.ZENDE_THREADFIN_PUBLIC_PORT ?? "34400", 10);
  if (!Number.isFinite(n) || n < 1) return 34400;
  return n;
}

/** Host Plex should use (LAN IP / hostname). Empty = derive from request later. */
export function threadfinPublicHost(): string {
  return (process.env.ZENDE_THREADFIN_PUBLIC_HOST ?? "").trim();
}

/** Full public proxy base, including an optional path such as https://example.com/thf. */
export function threadfinPublicBaseUrl(): string {
  return (process.env.ZENDE_THREADFIN_PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
}

/**
 * Deterministic portal password for the Threadfin service account.
 * Recoverable from AUTH_JWT_SECRET so M3U URLs can be rebuilt without storing plaintext.
 */
export function deriveThreadfinPortalPassword(): string {
  const secret =
    (process.env.AUTH_JWT_SECRET ?? "").trim() || "zende-local-dev-jwt-secret-change-in-prod";
  return createHmac("sha256", secret)
    .update("zende-threadfin-portal-v1")
    .digest("base64url")
    .slice(0, 28);
}

/** Stable positive stream id from kind + upstream URL (or series episode key). */
export function stableThreadfinStreamId(kind: "live" | "movie" | "episode", key: string): number {
  const h = createHmac("sha1", "zende-threadfin-stream-id")
    .update(`${kind}:${key}`)
    .digest();
  // 31-bit positive int
  const n = ((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 1;
  return n === 0 ? 1 : n;
}
