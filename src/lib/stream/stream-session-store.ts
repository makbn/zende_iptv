import "server-only";

import { createHash, randomBytes } from "crypto";

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

type CachedSessionEntry = { record: StreamSessionRecord; fetchedAt: number };
const sessionReadCache = new Map<string, CachedSessionEntry>();
const sessionLastTouchWrite = new Map<string, number>();

/** Evict a session from the read cache (call after updating aliases or cookies). */
export function evictSessionCache(id: string): void {
  sessionReadCache.delete(id);
}

/** `{ origin: { name: value } }` — replayed as `Cookie` on later fetches to that origin. */
export type CookieJar = Record<string, Record<string, string>>;

export type StreamSessionRecord = {
  upstreamRootUrl: string;
  title: string;
  logo?: string;
  group?: string;
  urlAliases: Map<string, string>;
  /** Per `?h=` hash: upstream playlist URL to send as `Referer` (correct media playlist for segments). */
  aliasReferers: Map<string, string>;
  cookieJar: CookieJar;
  /** Latest upstream `.m3u8` URL — fallback `Referer` when no per-hash entry exists. */
  lastRefererUrl: string | null;
  lastAccessAt: number;
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
  await prisma.$transaction(async (tx) => {
    const row = await tx.streamProxySession.findUnique({
      where: { id: sessionId },
      select: { cookieJarJson: true },
    });
    const existing = parseCookieJarJson(row?.cookieJarJson ?? "{}");
    for (const [origin, bag] of Object.entries(jar)) {
      if (!bag || typeof bag !== "object") continue;
      if (!existing[origin]) existing[origin] = {};
      Object.assign(existing[origin], bag);
    }
    await tx.streamProxySession.update({
      where: { id: sessionId },
      data: { cookieJarJson: JSON.stringify(existing) },
    });
  });
  evictSessionCache(sessionId);
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
  try {
    const opts: RequestInit & { dispatcher?: ProxyAgent } = {
      redirect: "follow",
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
  } catch {
    /* warm-up failure is non-fatal */
  }
  return jar;
}

export async function createStreamSession(input: {
  upstreamRootUrl: string;
  title: string;
  logo?: string;
  group?: string;
  /**
   * Seed cookies to send with every upstream request.  Keys are cookie names,
   * values are cookie values — all scoped to the origin of `upstreamRootUrl`.
   * Use this to hand off authenticated browser cookies for gated streams.
   */
  cookies?: Record<string, string>;
  /** When set, ALL upstream fetches for this session go through this proxy — no direct connections. */
  proxyConfig?: StoredProxyConfig;
}): Promise<string> {
  const id = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_IDLE_MS);

  // Build proxy agent first so warm-up also uses it (zero leak).
  let proxyAgent: ProxyAgent | undefined;
  if (input.proxyConfig) {
    const { buildProxyAgent } = await import("@/lib/proxies/proxy-agent");
    proxyAgent = buildProxyAgent(input.proxyConfig);
  }

  // Build initial cookie jar: warm-up fetch first, then overlay any caller-supplied cookies.
  const jar = await warmupCookies(input.upstreamRootUrl, proxyAgent);

  if (input.cookies && Object.keys(input.cookies).length > 0) {
    let origin: string;
    try {
      origin = new URL(input.upstreamRootUrl).origin;
    } catch {
      origin = input.upstreamRootUrl;
    }
    if (!jar[origin]) jar[origin] = {};
    Object.assign(jar[origin], input.cookies);
  }

  await prisma.streamProxySession.create({
    data: {
      id,
      upstreamRootUrl: input.upstreamRootUrl,
      title: input.title,
      logo: input.logo ?? null,
      groupTitle: input.group ?? null,
      urlAliasesJson: "{}",
      aliasReferersJson: "{}",
      cookieJarJson: JSON.stringify(jar),
      proxyConfigJson: input.proxyConfig ? JSON.stringify(input.proxyConfig) : null,
      expiresAt,
    },
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
    // Still schedule a fire-and-forget write if the interval has elapsed,
    // so the session stays alive even while the cache absorbs all reads.
    const lastWrite = sessionLastTouchWrite.get(id) ?? 0;
    if (now - lastWrite > SESSION_TOUCH_WRITE_INTERVAL_MS) {
      sessionLastTouchWrite.set(id, now);
      prisma.streamProxySession
        .update({ where: { id }, data: { expiresAt: new Date(now + SESSION_IDLE_MS) } })
        .catch(() => {});
    }
    return cached.record;
  }

  const row = await prisma.streamProxySession.findUnique({ where: { id } });
  if (!row) {
    sessionReadCache.delete(id);
    sessionLastTouchWrite.delete(id);
    return null;
  }

  if (row.expiresAt.getTime() < now) {
    prisma.streamProxySession.delete({ where: { id } }).catch(() => {});
    sessionReadCache.delete(id);
    sessionLastTouchWrite.delete(id);
    return null;
  }

  const record: StreamSessionRecord = {
    upstreamRootUrl: row.upstreamRootUrl,
    title: row.title,
    logo: row.logo ?? undefined,
    group: row.groupTitle ?? undefined,
    urlAliases: parseAliasesJson(row.urlAliasesJson),
    aliasReferers: parseReferersJson(row.aliasReferersJson ?? "{}"),
    cookieJar: parseCookieJarJson(row.cookieJarJson),
    lastRefererUrl: row.lastRefererUrl ?? null,
    lastAccessAt: now,
    proxyConfig: parseProxyConfigJson(row.proxyConfigJson ?? null),
  };

  sessionReadCache.set(id, { record, fetchedAt: now });

  const lastWrite = sessionLastTouchWrite.get(id) ?? 0;
  if (now - lastWrite > SESSION_TOUCH_WRITE_INTERVAL_MS) {
    sessionLastTouchWrite.set(id, now);
    prisma.streamProxySession
      .update({ where: { id }, data: { expiresAt: new Date(now + SESSION_IDLE_MS) } })
      .catch(() => {});
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
  await prisma.$transaction(async (tx) => {
    const row = await tx.streamProxySession.findUnique({
      where: { id: sessionId },
      select: { urlAliasesJson: true, aliasReferersJson: true },
    });
    const merged = parseAliasesJson(row?.urlAliasesJson ?? "{}");
    const mergedReferers = parseReferersJson(row?.aliasReferersJson ?? "{}");
    for (const [k, v] of aliases) {
      merged.set(k, v);
    }
    for (const [k, v] of referers) {
      mergedReferers.set(k, v);
    }
    await tx.streamProxySession.update({
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
  evictSessionCache(sessionId);
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
