import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import {
  THREADFIN_PORTAL_USERNAME,
  deriveThreadfinPortalPassword,
  threadfinConfDir,
  threadfinInternalUrl,
  threadfinMaxChannels,
  threadfinSourceOrigin,
  threadfinTunerCount,
} from "@/lib/threadfin/config";
import {
  getThreadfinCatalog,
  invalidateThreadfinCatalogCache,
} from "@/lib/threadfin/catalog";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const log = createServerLogger("lib.threadfin.sync");

// Threadfin infers the provider type from the first character of this ID
// (`M` = M3U, `H` = HDHR). A non-standard prefix leaves the provider type
// empty and silently reduces its tuner limit to one.
const ZENDE_M3U_ID = "M-zende-full-catalog";
const ZENDE_XMLTV_ID = "zende-full-epg";

export type ThreadfinSyncResult = {
  ok: boolean;
  error?: string;
  counts?: {
    live: number;
    movie: number;
    episode: number;
    total: number;
    favoriteTotal: number;
    skippedUnplayable: number;
    capped: boolean;
    maxChannels: number;
  };
  portalUsername: string;
  playlistUrl: string;
  epgUrl: string;
};

function sourceUrls(username: string, password: string) {
  const origin = threadfinSourceOrigin();
  const q = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  return {
    playlistUrl: `${origin}/api/threadfin/playlist.m3u?${q}`,
    epgUrl: `${origin}/api/threadfin/epg.xml?${q}`,
  };
}

/** Ensure the dedicated Threadfin portal credential exists with the derived password. */
export async function ensureThreadfinPortalCredential(): Promise<{
  portalUsername: string;
  portalPassword: string;
}> {
  const portalUsername = THREADFIN_PORTAL_USERNAME;
  const portalPassword = deriveThreadfinPortalPassword();
  const passwordHash = await hashPassword(portalPassword);

  const existing = await prisma.iptvClientCredential.findUnique({
    where: { portalUsername },
  });

  if (existing) {
    await prisma.iptvClientCredential.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        label: existing.label || "Threadfin",
      },
    });
  } else {
    await prisma.iptvClientCredential.create({
      data: {
        label: "Threadfin",
        portalUsername,
        passwordHash,
        ownerUserId: null,
      },
    });
  }

  await prisma.threadfinSyncState.upsert({
    where: { id: 1 },
    create: { id: 1, portalUsername },
    update: { portalUsername },
  });

  return { portalUsername, portalPassword };
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * Patch Threadfin settings.json so API is on and Zende M3U/XMLTV sources are registered.
 */
export async function seedThreadfinSettings(args: {
  playlistUrl: string;
  epgUrl: string;
}): Promise<void> {
  const confDir = threadfinConfDir();
  const settingsPath = path.join(confDir, "settings.json");
  const existing = (await readJsonFile(settingsPath)) ?? {};

  const files =
    existing.files && typeof existing.files === "object"
      ? (existing.files as Record<string, unknown>)
      : {};
  const m3uMap =
    files.m3u && typeof files.m3u === "object"
      ? ({ ...(files.m3u as Record<string, unknown>) } as Record<string, Record<string, unknown>>)
      : ({} as Record<string, Record<string, unknown>>);
  const xmltvMap =
    files.xmltv && typeof files.xmltv === "object"
      ? ({ ...(files.xmltv as Record<string, unknown>) } as Record<
          string,
          Record<string, unknown>
        >)
      : ({} as Record<string, Record<string, unknown>>);

  // Remove prior Zende entries (by id or name)
  for (const [id, entry] of Object.entries(m3uMap)) {
    const name = typeof entry?.name === "string" ? entry.name : "";
    if (id === ZENDE_M3U_ID || name === "Zende") delete m3uMap[id];
  }
  for (const [id, entry] of Object.entries(xmltvMap)) {
    const name = typeof entry?.name === "string" ? entry.name : "";
    if (id === ZENDE_XMLTV_ID || name === "Zende EPG") delete xmltvMap[id];
  }

  m3uMap[ZENDE_M3U_ID] = {
    ...(m3uMap[ZENDE_M3U_ID] ?? {}),
    name: "Zende",
    description: "Primary administrator favorites (Live + VOD)",
    "file.source": args.playlistUrl,
    type: "m3u",
    // Threadfin selects the streaming mode from the playlist entry itself.
    // Omitting this value sends the request into its buffer path with an empty
    // implementation, which returns 200 with a zero-byte body to Plex.
    buffer: "ffmpeg",
    tuner: threadfinTunerCount(),
    "last.update": 0,
    "provider.availability": 100,
  };

  xmltvMap[ZENDE_XMLTV_ID] = {
    ...(xmltvMap[ZENDE_XMLTV_ID] ?? {}),
    name: "Zende EPG",
    description: "Zende XMLTV for Threadfin",
    "file.source": args.epgUrl,
    type: "xmltv",
    "last.update": 0,
    "provider.availability": 100,
  };

  const uuid =
    typeof existing.uuid === "string" && existing.uuid.length > 0
      ? existing.uuid
      : randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  const next = {
    ...existing,
    api: true,
    "authentication.api": false,
    "authentication.web": false,
    "authentication.m3u": false,
    "authentication.pms": false,
    "authentication.xml": false,
    // XEPG is required for Threadfin to import Zende's generated XMLTV and
    // expose its programmes to Plex. PMS means Plex supplies the guide itself.
    epgSource: "XEPG",
    tuner: threadfinTunerCount(),
    port: "34400",
    uuid,
    "files.update": true,
    // Zende has already reduced the source to a Plex-safe lineup. Without
    // this, Threadfin activates zero channels whenever no UI filter exists.
    ignoreFilters: true,
    files: {
      ...files,
      hdhr: files.hdhr && typeof files.hdhr === "object" ? files.hdhr : {},
      m3u: m3uMap,
      xmltv: xmltvMap,
    },
    // Keep the global setting aligned with the per-playlist mode above. The
    // per-playlist value is the one Threadfin uses while tuning a channel.
    buffer: "ffmpeg",
    "buffer.size.kb": existing["buffer.size.kb"] ?? 1024,
    "buffer.timeout": existing["buffer.timeout"] ?? 5,
    language: existing.language ?? "en",
    "log.entries.ram": existing["log.entries.ram"] ?? 500,
    "mapping.first.channel": existing["mapping.first.channel"] ?? 1000,
    ssdp: existing.ssdp ?? true,
    update: Array.isArray(existing.update) ? existing.update : ["0000"],
    "user.agent":
      typeof existing["user.agent"] === "string"
        ? existing["user.agent"]
        : "Threadfin",
    version: typeof existing.version === "string" ? existing.version : "1.0.0",
    ThreadfinAutoUpdate: false,
  };

  await writeJsonFile(settingsPath, next);
  log.info("seeded threadfin settings", {
    settingsPath,
    m3uId: ZENDE_M3U_ID,
    xmltvId: ZENDE_XMLTV_ID,
  });
}

async function waitForThreadfin(timeoutMs = 90_000): Promise<boolean> {
  const base = threadfinInternalUrl();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${base}/discover.json`, {
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (res.ok || res.status === 200) return true;
      // Some builds return HTML on / until ready; try API
      const api = await fetch(`${base}/api/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: "status" }),
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (api.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

async function restartThreadfinContainer(): Promise<boolean> {
  try {
    const Docker = (await import("dockerode")).default;
    const docker = new Docker();
    const container = docker.getContainer("threadfin");
    await container.restart({ t: 5 });
    log.info("restarted threadfin container to reload settings");
    return true;
  } catch (err) {
    log.warn("could not restart threadfin container", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function threadfinApiCmd(cmd: string): Promise<boolean> {
  const base = threadfinInternalUrl();
  try {
    const res = await fetch(`${base}/api/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      err?: string;
      "streams.all"?: number;
    };
    if (!res.ok) {
      log.warn("threadfin api non-OK", { cmd, status: res.status });
      return false;
    }
    if (body.status === false || body.err) {
      log.warn("threadfin api rejected command", { cmd, err: body.err });
      return false;
    }
    return true;
  } catch (err) {
    log.warn("threadfin api failed", {
      cmd,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function threadfinStatusOk(): Promise<boolean> {
  const base = threadfinInternalUrl();
  try {
    const res = await fetch(`${base}/api/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: "status" }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      "streams.all"?: number;
    };
    return body.status === true || typeof body["streams.all"] === "number";
  } catch {
    return false;
  }
}

export async function syncThreadfin(opts?: {
  skipWait?: boolean;
}): Promise<ThreadfinSyncResult> {
  const { portalUsername, portalPassword } = await ensureThreadfinPortalCredential();
  const { playlistUrl, epgUrl } = sourceUrls(portalUsername, portalPassword);

  invalidateThreadfinCatalogCache();
  const catalog = await getThreadfinCatalog();

  try {
    await seedThreadfinSettings({ playlistUrl, epgUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("could not write threadfin conf (volume missing?)", { message });
    await prisma.threadfinSyncState.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        portalUsername,
        lastSyncAt: new Date(),
        lastSyncOk: false,
        lastSyncError: message,
        lastCountsJson: JSON.stringify(catalog.counts),
      },
      update: {
        portalUsername,
        lastSyncAt: new Date(),
        lastSyncOk: false,
        lastSyncError: message,
        lastCountsJson: JSON.stringify(catalog.counts),
      },
    });
    return {
      ok: false,
      error: message,
      counts: catalog.counts,
      portalUsername,
      playlistUrl,
      epgUrl,
    };
  }

  if (!opts?.skipWait) {
    const ready = await waitForThreadfin();
    if (!ready) {
      const error = `Threadfin not reachable at ${threadfinInternalUrl()} (ok if running without the sidecar)`;
      log.warn(error);
      await prisma.threadfinSyncState.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          portalUsername,
          lastSyncAt: new Date(),
          lastSyncOk: false,
          lastSyncError: error,
          lastCountsJson: JSON.stringify(catalog.counts),
        },
        update: {
          portalUsername,
          lastSyncAt: new Date(),
          lastSyncOk: false,
          lastSyncError: error,
          lastCountsJson: JSON.stringify(catalog.counts),
        },
      });
      return {
        ok: false,
        error,
        counts: catalog.counts,
        portalUsername,
        playlistUrl,
        epgUrl,
      };
    }
  }

  // Threadfin reads settings.json at start — restart so seeded M3U sources load.
  await restartThreadfinContainer();
  await waitForThreadfin(60_000);

  // Threadfin's API uses the dotted, lower-case command names. Unknown names
  // have returned a misleading success response in some builds.
  const m3uOk = await threadfinApiCmd("update.m3u");
  const xmlOk = await threadfinApiCmd("update.xmltv");
  const xepgOk = await threadfinApiCmd("update.xepg");
  const statusOk = await threadfinStatusOk();

  const ok = statusOk && m3uOk && xmlOk && xepgOk;
  const error = ok
    ? undefined
    : "Threadfin API refresh failed (is API enabled?). Settings were seeded; open Threadfin UI once if needed.";

  await prisma.threadfinSyncState.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      portalUsername,
      lastSyncAt: new Date(),
      lastSyncOk: ok,
      lastSyncError: error ?? null,
      lastCountsJson: JSON.stringify(catalog.counts),
    },
    update: {
      portalUsername,
      lastSyncAt: new Date(),
      lastSyncOk: ok,
      lastSyncError: error ?? null,
      lastCountsJson: JSON.stringify(catalog.counts),
    },
  });

  log.info("threadfin sync finished", {
    ok,
    m3uOk,
    xmlOk,
    xepgOk,
    total: catalog.counts.total,
    maxChannels: threadfinMaxChannels(),
  });

  return {
    ok,
    error,
    counts: catalog.counts,
    portalUsername,
    playlistUrl,
    epgUrl,
  };
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced sync after catalog changes. */
export function scheduleThreadfinSync(delayMs = 15_000): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncThreadfin({ skipWait: true }).catch((err) => {
      log.warn("scheduled threadfin sync failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }, delayMs);
}
