import "server-only";

import { createHash, randomBytes } from "crypto";

import { createServerLogger } from "@/core/logging/server";
import {
  isXtreamLiveStreamUrl,
  normalizeXtreamLivePlaybackUrl,
} from "@/lib/stream/playback-url";
import { redactStreamUrlForLog } from "@/lib/stream/redact-stream-url";
import {
  parsePlaybackSessionMeta,
  serializePlaybackSessionMeta,
  type PlaybackSessionMeta,
} from "@/lib/playback/stream-session-meta";
import { prisma } from "@/lib/db/prisma";
import type { ProxyAgent } from "undici";
import { parseProxyConfigJson, type StoredProxyConfig } from "@/lib/proxies/proxy-store";

/** Sliding TTL — refreshed on each proxy / metadata request. */
const SESSION_IDLE_MS = 6 * 60 * 60 * 1000;

/**
 * How often touchSession writes expiresAt back to the DB (per session).
 * Every segment request calls touchSession; writing on every one causes
 * SQLite write contention under HLS load. One write per minute is enough
 * to keep a 6-hour sliding TTL alive.
 */
const SESSION_TOUCH_WRITE_INTERVAL_MS = 60_000;

/**
 * In-memory read cache TTL. Deduplicates the burst of concurrent DB reads
 * that arrive when an HLS player fetches several segments in parallel.
 */
const SESSION_READ_CACHE_TTL_MS = 3_000;
const log = createServerLogger("lib.stream.session-store");

type CachedSessionEntry = { record: StreamSessionRecord; fetchedAt: number };
const sessionReadCache = new Map<string, CachedSessionEntry>();
const sessionLastTouchWrite = new Map<string, number>();

// SQLite permits only one writer. HLS bootstraps can otherwise start alias,
// cookie, and TTL updates for several sessions at the same instant, causing
// Prisma P1008/P2028 timeouts even though every individual update is tiny.
let streamSessionWriteQueue: Promise<void> = Promise.resolve();

function enqueueStreamSessionWrite(operation: () => Promise<void>): Promise<void> {
  const queued = streamSessionWriteQueue.catch(() => {}).then(operation);
  streamSessionWriteQueue = queued.catch(() => {});
  return queued;
}

/** Evict a session from the read cache (call after updating aliases or cookies). */
export function evictSessionCache(id: string): void {
  sessionReadCache.delete(id);
}

/** `{ origin: { name: value } }` — replayed as `Cookie` on later fetches to that origin. */
export type CookieJar = Record<string, Record<string, string>>;

export type StreamSessionRecord = {
  /** Signed-in owner for browser playback; null for explicit public/integration relays. */
  ownerUserId: string | null;
  /** Hash of a cookie-only grant for an intentionally shared session. */
  accessGrantHash: string | null;
  upstreamRootUrl: string;
  title: string;
  logo?: string;
  group?: string;
  meta: PlaybackSessionMeta;
  urlAliases: Map<string, string>;
  /** Per `?h=` hash: upstream playlist URL to send as `Referer` (correct media playlist for segments). */
  aliasReferers: Map<string, string>;
  cookieJar: CookieJar;
  /** Latest upstream `.m3u8` URL — fallback `Referer` when no per-hash entry exists. */
  lastRefererUrl: string | null;
  lastAccessAt: number;
  /** Hard expiry for public-share sessions; never extended by playback traffic. */
  absoluteExpiresAt?: number;
  /** Proxy config for this session — every upstream fetch MUST go through this proxy when set. */
  proxyConfig: StoredProxyConfig | null;
};

function parseReferersJson(raw: string): Map<string, string> {
  try {
    const o = JSON.parse(raw || "{}") as Record<string, string>;
    return new Map(Object.entries(o));
  } catch {
    return new Map();
  }
}

function parseAliasesJson(raw: string): Map<string, string> {
  try {
    const o = JSON.parse(raw || "{}") as Record<string, string>;
    return new Map(Object.entries(o));
  } catch {
    return new Map();
  }
}

export function parseCookieJarJson(raw: string): CookieJar {
  try {
    const o = JSON.parse(raw || "{}") as CookieJar;
    if (!o || typeof o !== "object") return {};
    return o;
  } catch {
    return {};
  }
}

function jarOriginMatchesTarget(jarOrigin: string, target: URL): boolean {
  try {
    const jo = new URL(jarOrigin);
    const th = target.hostname;
    const jh = jo.hostname;
    return (
      th === jh ||
      th.endsWith(`.${jh}`) ||
      jh.endsWith(`.${th}`)
    );
  } catch {
    return false;
  }
}

/** Build `Cookie` header — merges jars across matching hosts (e.g. cookies set on `tvpass.org` sent to `cdn.tvpass.org`). */
export function cookieHeaderForFetchUrl(
  url: string,
  jar: CookieJar,
): string | undefined {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return undefined;
  }
  const merged: Record<string, string> = {};
  for (const [jarOrigin, bag] of Object.entries(jar)) {
    if (!bag || typeof bag !== "object") continue;
    if (!jarOriginMatchesTarget(jarOrigin, target)) continue;
    Object.assign(merged, bag);
  }
  const parts = Object.entries(merged).filter(([k]) => k.length > 0);
  if (parts.length === 0) return undefined;
  return parts.map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Merge `Set-Cookie` name=value pairs into the jar for `fetchUrl`'s origin. Returns whether anything changed. */
export function mergeSetCookieIntoJar(
  fetchUrl: string,
  setCookieLines: string[],
  jar: CookieJar,
): boolean {
  if (setCookieLines.length === 0) return false;
  let origin: string;
  try {
    origin = new URL(fetchUrl).origin;
  } catch {
    return false;
  }
  if (!jar[origin]) jar[origin] = {};
  let changed = false;
  for (const line of setCookieLines) {
    const first = line.split(";")[0]?.trim();
    if (!first?.includes("=")) continue;
    const i = first.indexOf("=");
    const name = first.slice(0, i).trim();
    const value = first.slice(i + 1).trim();
    if (!name) continue;
    if (jar[origin][name] !== value) {
      jar[origin][name] = value;
      changed = true;
    }
  }
  return changed;
}

export function getSetCookieLines(res: Response): string[] {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") {
    return h.getSetCookie();
  }
  // Fallback for runtimes without getSetCookie — get() joins with comma which
  // is technically wrong for Set-Cookie but handles single-cookie responses.
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

export async function persistCookieJar(
  sessionId: string,
  jar: CookieJar,
): Promise<void> {
  const cached = sessionReadCache.get(sessionId);
  if (cached) {
    cached.record.cookieJar = jar;
    cached.fetchedAt = Date.now();
  }

  await enqueueStreamSessionWrite(async () => {
    if (cached) {
      await prisma.streamProxySession.update({
        where: { id: sessionId },
        data: { cookieJarJson: JSON.stringify(jar) },
      });
      return;
    }

    const row = await prisma.streamProxySession.findUnique({
      where: { id: sessionId },
      select: { cookieJarJson: true },
    });
    if (!row) return;
    const existing = parseCookieJarJson(row.cookieJarJson ?? "{}");
    for (const [origin, bag] of Object.entries(jar)) {
      if (!bag || typeof bag !== "object") continue;
      if (!existing[origin]) existing[origin] = {};
      Object.assign(existing[origin], bag);
    }
    await prisma.streamProxySession.update({
      where: { id: sessionId },
      data: { cookieJarJson: JSON.stringify(existing) },
    });
  });
}

const WARMUP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Best-effort fetch of `url` to collect any Set-Cookie headers the upstream
 * issues on first contact (session tokens, tracking cookies, etc.).
 * When a proxy is configured, the warm-up also goes through it — no direct leakage.
 */
async function warmupCookies(url: string, proxyAgent?: ProxyAgent): Promise<CookieJar> {
  const jar: CookieJar = {};
  const started = Date.now();
  try {
    const opts: RequestInit & { dispatcher?: ProxyAgent } = {
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
      headers: {
        "User-Agent": WARMUP_UA,
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: new URL(url).origin + "/",
      },
    };
    if (proxyAgent) opts.dispatcher = proxyAgent;
    const res = await fetch(url, opts as RequestInit);
    const lines = getSetCookieLines(res);
    res.body?.cancel().catch(() => {});
    if (lines.length > 0) mergeSetCookieIntoJar(url, lines, jar);
    log.info("Warm-up cookie probe completed", {
      upstreamHost: (() => {
        try {
          return new URL(url).host;
        } catch {
          return "(bad-url)";
        }
      })(),
      status: res.status,
      setCookieCount: lines.length,
      usingProxy: Boolean(proxyAgent),
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    // warm-up failure is non-fatal; keep a breadcrumb for stream startup forensics.
    log.warn("Warm-up cookie probe failed (non-fatal)", {
      upstreamHost: (() => {
        try {
          return new URL(url).host;
        } catch {
          return "(bad-url)";
        }
      })(),
      usingProxy: Boolean(proxyAgent),
      message: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started,
    });
  }
  return jar;
}

export async function createStreamSession(input: {
  /** Bind browser playback to this authenticated user. */
  ownerUserId?: string;
  /** Raw one-time grant; only its SHA-256 hash is persisted. */
  accessGrant?: string;
  upstreamRootUrl: string;
  title: string;
  logo?: string;
  group?: string;
  meta?: PlaybackSessionMeta;
  /**
   * When false, keep Xtream `/live/.../*.ts` roots as MPEG-TS (used by DVR ffmpeg).
   * Default true converts them to `.m3u8` for browser HLS.
   */
  normalizeXtreamLiveUrl?: boolean;
  /**
   * Seed cookies to send with every upstream request.  Keys are cookie names,
   * values are cookie values — all scoped to the origin of `upstreamRootUrl`.
   * Use this to hand off authenticated browser cookies for gated streams.
   */
  cookies?: Record<string, string>;
  /** When set, ALL upstream fetches for this session go through this proxy — no direct connections. */
  proxyConfig?: StoredProxyConfig;
  /** Optional hard stop. Used by public share links and never extended. */
  absoluteExpiresAt?: Date;
}): Promise<string> {
  const started = Date.now();
  const id = randomBytes(18).toString("base64url");
  const absoluteExpiresAt = input.absoluteExpiresAt;
  const expiresAt = new Date(
    Math.min(
      Date.now() + SESSION_IDLE_MS,
      absoluteExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
    ),
  );
  const upstreamRootUrl =
    input.normalizeXtreamLiveUrl === false
      ? input.upstreamRootUrl.trim()
      : normalizeXtreamLivePlaybackUrl(input.upstreamRootUrl);
  if (
    input.normalizeXtreamLiveUrl !== false &&
    upstreamRootUrl !== input.upstreamRootUrl
  ) {
    log.info("Session upstream normalized ts→m3u8", {
      from: redactStreamUrlForLog(input.upstreamRootUrl),
      to: redactStreamUrlForLog(upstreamRootUrl),
    });
  }

  // Build proxy agent first so warm-up also uses it (zero leak).
  let proxyAgent: ProxyAgent | undefined;
  if (input.proxyConfig) {
    const { buildProxyAgent } = await import("@/lib/proxies/proxy-agent");
    proxyAgent = buildProxyAgent(input.proxyConfig);
  }

  // Xtream live URLs authenticate in the path. Fetching one here only duplicates
  // the manifest request and can assign a different CDN shard than playback uses.
  // The real proxy bootstrap already captures cookies across every redirect hop.
  const skipWarmup = isXtreamLiveStreamUrl(upstreamRootUrl);
  const jar = skipWarmup ? {} : await warmupCookies(upstreamRootUrl, proxyAgent);

  if (input.cookies && Object.keys(input.cookies).length > 0) {
    let origin: string;
    try {
      origin = new URL(upstreamRootUrl).origin;
    } catch {
      origin = upstreamRootUrl;
    }
    if (!jar[origin]) jar[origin] = {};
    Object.assign(jar[origin], input.cookies);
  }

  const meta = input.meta ?? {};
  await enqueueStreamSessionWrite(async () => {
    await prisma.streamProxySession.create({
      data: {
        id,
        ownerUserId: input.ownerUserId ?? null,
        accessGrantHash: input.accessGrant
          ? createHash("sha256").update(input.accessGrant).digest("hex")
          : null,
        upstreamRootUrl: upstreamRootUrl,
        title: input.title,
        logo: input.logo ?? null,
        groupTitle: input.group ?? null,
        metaJson: serializePlaybackSessionMeta(meta),
        urlAliasesJson: "{}",
        aliasReferersJson: "{}",
        cookieJarJson: JSON.stringify(jar),
        proxyConfigJson: input.proxyConfig ? JSON.stringify(input.proxyConfig) : null,
        expiresAt,
        absoluteExpiresAt: absoluteExpiresAt ?? null,
      },
    });
  });
  const createdAt = Date.now();
  sessionReadCache.set(id, {
    fetchedAt: createdAt,
    record: {
      ownerUserId: input.ownerUserId ?? null,
      accessGrantHash: input.accessGrant
        ? createHash("sha256").update(input.accessGrant).digest("hex")
        : null,
      upstreamRootUrl,
      title: input.title,
      logo: input.logo,
      group: input.group,
      meta,
      urlAliases: new Map(),
      aliasReferers: new Map(),
      cookieJar: jar,
      lastRefererUrl: null,
      lastAccessAt: createdAt,
      absoluteExpiresAt: absoluteExpiresAt?.getTime(),
      proxyConfig: input.proxyConfig ?? null,
    },
  });
  // The row was just created with a six-hour expiry; its first media request
  // must not immediately enqueue a redundant TTL write.
  sessionLastTouchWrite.set(id, createdAt);
  log.info("Created stream proxy session row", {
    sessionId: id,
    upstreamHost: (() => {
      try {
        return new URL(upstreamRootUrl).host;
      } catch {
        return "(bad-url)";
      }
    })(),
    hasProxy: Boolean(input.proxyConfig),
    aliasCount: 0,
    cookieOrigins: Object.keys(jar).length,
    skippedWarmup: skipWarmup,
    elapsedMs: Date.now() - started,
  });
  return id;
}

/**
 * Loads the session, deletes if expired, otherwise extends `expiresAt`.
 *
 * Read path: served from a 3-second in-memory cache to absorb the burst of
 * parallel segment requests that arrive together under HLS load.
 *
 * Write path: expiresAt is updated in the DB at most once per 60 seconds
 * per session, fire-and-forget — a slow DB write never blocks a segment
 * response and SQLite write contention is eliminated.
 */
export async function touchSession(
  id: string,
): Promise<StreamSessionRecord | null> {
  const now = Date.now();

  // Serve from cache when it's fresh — skips both the findUnique and update.
  const cached = sessionReadCache.get(id);
  if (cached && now - cached.fetchedAt < SESSION_READ_CACHE_TTL_MS) {
    if (cached.record.absoluteExpiresAt != null && cached.record.absoluteExpiresAt <= now) {
      sessionReadCache.delete(id);
      sessionLastTouchWrite.delete(id);
      enqueueStreamSessionWrite(async () => {
        await prisma.streamProxySession.deleteMany({ where: { id } });
      }).catch(() => {});
      return null;
    }
    // Still schedule a fire-and-forget write if the interval has elapsed,
    // so the session stays alive even while the cache absorbs all reads.
    const lastWrite = sessionLastTouchWrite.get(id) ?? 0;
    if (now - lastWrite > SESSION_TOUCH_WRITE_INTERVAL_MS) {
      sessionLastTouchWrite.set(id, now);
      enqueueStreamSessionWrite(async () => {
        await prisma.streamProxySession.update({
          where: { id },
          data: {
            expiresAt: new Date(
              Math.min(
                now + SESSION_IDLE_MS,
                cached.record.absoluteExpiresAt ?? Number.POSITIVE_INFINITY,
              ),
            ),
          },
        });
      })
        .catch((err) => {
          log.warn("Failed to persist session TTL extension (cached path)", {
            sessionId: id,
            message: err instanceof Error ? err.message : String(err),
          });
        });
    }
    return cached.record;
  }

  const row = await prisma.streamProxySession.findUnique({ where: { id } });
  if (!row) {
    sessionReadCache.delete(id);
    sessionLastTouchWrite.delete(id);
    return null;
  }

  if (
    row.expiresAt.getTime() < now ||
    (row.absoluteExpiresAt != null && row.absoluteExpiresAt.getTime() <= now)
  ) {
    enqueueStreamSessionWrite(async () => {
      await prisma.streamProxySession.delete({ where: { id } });
    }).catch((err) => {
      log.warn("Failed to delete expired session row", {
        sessionId: id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
    sessionReadCache.delete(id);
    sessionLastTouchWrite.delete(id);
    return null;
  }

  const record: StreamSessionRecord = {
    ownerUserId: row.ownerUserId ?? null,
    accessGrantHash: row.accessGrantHash ?? null,
    upstreamRootUrl: row.upstreamRootUrl,
    title: row.title,
    logo: row.logo ?? undefined,
    group: row.groupTitle ?? undefined,
    meta: parsePlaybackSessionMeta(row.metaJson),
    urlAliases: parseAliasesJson(row.urlAliasesJson),
    aliasReferers: parseReferersJson(row.aliasReferersJson ?? "{}"),
    cookieJar: parseCookieJarJson(row.cookieJarJson),
    lastRefererUrl: row.lastRefererUrl ?? null,
    lastAccessAt: now,
    absoluteExpiresAt: row.absoluteExpiresAt?.getTime(),
    proxyConfig: parseProxyConfigJson(row.proxyConfigJson ?? null),
  };

  sessionReadCache.set(id, { record, fetchedAt: now });

  const lastWrite = sessionLastTouchWrite.get(id) ?? 0;
  if (now - lastWrite > SESSION_TOUCH_WRITE_INTERVAL_MS) {
    sessionLastTouchWrite.set(id, now);
    enqueueStreamSessionWrite(async () => {
      await prisma.streamProxySession.update({
        where: { id },
        data: {
          expiresAt: new Date(
            Math.min(
              now + SESSION_IDLE_MS,
              row.absoluteExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
            ),
          ),
        },
      });
    })
      .catch((err) => {
        log.warn("Failed to persist session TTL extension (db path)", {
          sessionId: id,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return record;
}

/** Persist alias map after rewriting a playlist. Merges with DB so concurrent playlist fetches cannot drop each other's hashes or referers. */
export async function persistUrlAliases(
  sessionId: string,
  aliases: Map<string, string>,
  referers: Map<string, string>,
  opts?: { playlistRefererUrl?: string },
): Promise<void> {
  const cachedEntry = sessionReadCache.get(sessionId);
  const cached = cachedEntry?.record;
  if (cachedEntry && cached) {
    const aliasesAlreadyKnown = Array.from(aliases).every(
      ([key, value]) => cached.urlAliases.get(key) === value,
    );
    const referersAlreadyKnown = Array.from(referers).every(
      ([key, value]) => cached.aliasReferers.get(key) === value,
    );
    const playlistRefererAlreadyKnown =
      opts?.playlistRefererUrl === undefined ||
      cached.lastRefererUrl === opts.playlistRefererUrl;
    if (
      aliasesAlreadyKnown &&
      referersAlreadyKnown &&
      playlistRefererAlreadyKnown
    ) {
      return;
    }

    for (const [key, value] of aliases) cached.urlAliases.set(key, value);
    for (const [key, value] of referers) cached.aliasReferers.set(key, value);
    if (opts?.playlistRefererUrl !== undefined) {
      cached.lastRefererUrl = opts.playlistRefererUrl;
    }
    cachedEntry.fetchedAt = Date.now();
  }

  const started = Date.now();
  let changed = false;
  await enqueueStreamSessionWrite(async () => {
    if (cached) {
      changed = true;
      await prisma.streamProxySession.update({
        where: { id: sessionId },
        data: {
          urlAliasesJson: JSON.stringify(Object.fromEntries(cached.urlAliases)),
          aliasReferersJson: JSON.stringify(Object.fromEntries(cached.aliasReferers)),
          ...(opts?.playlistRefererUrl !== undefined
            ? { lastRefererUrl: cached.lastRefererUrl }
            : {}),
        },
      });
      return;
    }

    const row = await prisma.streamProxySession.findUnique({
      where: { id: sessionId },
      select: {
        urlAliasesJson: true,
        aliasReferersJson: true,
        lastRefererUrl: true,
      },
    });
    if (!row) {
      return;
    }
    const merged = parseAliasesJson(row.urlAliasesJson ?? "{}");
    const mergedReferers = parseReferersJson(row?.aliasReferersJson ?? "{}");
    for (const [k, v] of aliases) {
      if (merged.get(k) !== v) changed = true;
      merged.set(k, v);
    }
    for (const [k, v] of referers) {
      if (mergedReferers.get(k) !== v) changed = true;
      mergedReferers.set(k, v);
    }
    if (
      opts?.playlistRefererUrl !== undefined &&
      row.lastRefererUrl !== opts.playlistRefererUrl
    ) {
      changed = true;
    }
    if (!changed) return;
    await prisma.streamProxySession.update({
      where: { id: sessionId },
      data: {
        urlAliasesJson: JSON.stringify(Object.fromEntries(merged)),
        aliasReferersJson: JSON.stringify(Object.fromEntries(mergedReferers)),
        ...(opts?.playlistRefererUrl !== undefined
          ? { lastRefererUrl: opts.playlistRefererUrl }
          : {}),
      },
    });
  });
  if (!changed) return;
  log.info("Persisted stream alias map", {
    sessionId,
    aliasCount: aliases.size,
    refererCount: referers.size,
    persistedReferer: opts?.playlistRefererUrl ? true : false,
    elapsedMs: Date.now() - started,
  });
}

export function resolveAlias(
  session: StreamSessionRecord,
  hash: string,
): string | undefined {
  return session.urlAliases.get(hash);
}

export function hashUrlAlias(absoluteUrl: string): string {
  return createHash("sha256").update(absoluteUrl).digest("hex").slice(0, 16);
}
