import "server-only";

import { createHash } from "crypto";

const APP_VERSION = process.env.npm_package_version ?? "0.1.0";

function stableDeviceId(): string {
  const fromEnv = process.env.ZENDE_HDHR_DEVICE_ID?.trim();
  if (fromEnv && /^[0-9A-Fa-f]{8}$/.test(fromEnv)) {
    return fromEnv.toUpperCase();
  }
  const seed =
    process.env.AUTH_JWT_SECRET?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "zende-hdhr-device";
  return createHash("sha256").update(seed).digest("hex").slice(0, 8).toUpperCase();
}

export function isHdhrEnabled(): boolean {
  const raw = process.env.ZENDE_HDHR_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}

export function getHdhrTunerCount(): number {
  const raw = process.env.ZENDE_HDHR_TUNER_COUNT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 4;
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.min(n, 32);
}

export function getHdhrFriendlyName(): string {
  return process.env.ZENDE_HDHR_FRIENDLY_NAME?.trim() || "Zende IPTV";
}

/** Optional cap — Plex struggles with huge lineups; unset = export all live channels. */
export function getHdhrMaxChannels(): number | null {
  const raw = process.env.ZENDE_HDHR_MAX_CHANNELS?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export function getHdhrDeviceId(): string {
  return stableDeviceId();
}

export function getHdhrFirmwareVersion(): string {
  return APP_VERSION;
}
