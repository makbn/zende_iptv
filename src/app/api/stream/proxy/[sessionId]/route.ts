import { NextResponse } from "next/server";
import {
  Agent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici";

import { createServerLogger } from "@/core/logging/server";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { buildProxyAgent } from "@/lib/proxies/proxy-agent";
import { DVR_RECORDING_SESSION_TITLE } from "@/lib/recordings/recording-session-title";
import {
  cookieHeaderForFetchUrl,
  getSetCookieLines,
  mergeSetCookieIntoJar,
  persistCookieJar,
  persistUrlAliases,
  resolveAlias,
  touchSession,
  type CookieJar,
  type StreamSessionRecord,
} from "@/lib/stream/stream-session-store";
import {
  looksLikeHlsPlaylist,
  rewriteM3u8Playlist,
} from "@/lib/stream/m3u8-rewrite";
import {
  isOpenEndedLiveMpegTsUrl,
  isProgressiveMediaUrl,
  shouldStreamProxyPassthrough,
} from "@/lib/stream/playback-url";
import { redactStreamUrlForLog } from "@/lib/stream/redact-stream-url";
import {
  acquireSharedStreamResponse,
  readSharedCacheBody,
  sharedStreamCacheKey,
  type SharedStreamCacheLease,
  type SharedStreamResponse,
} from "@/lib/stream/shared-response-cache";
import {
  acquireSharedManifest,
  sharedManifestCacheKey,
  type SharedManifestLease,
  type SharedManifestValue,
} from "@/lib/stream/shared-manifest-cache";
import {
  acquireSharedRootRefresh,
  forgetSharedRootPin,
  getSharedRootPin,
  rememberSharedRootPin,
} from "@/lib/stream/shared-root-pin-cache";
import { createResilientUpstream } from "@/lib/stream/resilient-upstream";

export const runtime = "nodejs";

const log = createServerLogger("api.stream.proxy");

function safeUrl(url: string): string {
  return redactStreamUrlForLog(url);
}

// ─── circuit breaker ──────────────────────────────────────────────────────────

/**
 * Circuit breaker: remembers the HTTP status (or 502 for network failures) the
 * first time a URL fails, then replays that status instantly for the TTL.
 *
 * Storing the original status is critical: returning 502 for a 403 upstream
 * causes hls.js to treat it as a transient error and retry at full speed.
 * Returning the real 403 tells hls.js "this variant is forbidden → fall back."
 *
 * TTL is intentionally shorter for transient errors (timeout / network drop)
 * than for hard auth/server failures so the player can retry quickly once the
 * VPN reconnects, without hammering a definitively broken variant.
 */
const breakerCache = new Map<string, { expiry: number; status: number }>();
/** Hard errors (403, 5xx): hold for 60 s so hls.js stops retrying immediately. */
const BREAKER_TTL_HARD_MS = 60_000;
/** Transient errors (timeout, connection refused): hold for only 8 s. */
const BREAKER_TTL_TRANSIENT_MS = 8_000;

function breakerTrip(sessionId: string, url: string, status: number, transient = false): void {
  const ttl = transient ? BREAKER_TTL_TRANSIENT_MS : BREAKER_TTL_HARD_MS;
  breakerCache.set(`${sessionId}:${url}`, { expiry: Date.now() + ttl, status });
}

function breakerStatus(sessionId: string, url: string): number | null {
  const key = `${sessionId}:${url}`;
  const entry = breakerCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    breakerCache.delete(key);
    return null;
  }
  return entry.status;
}

// ─── constants ────────────────────────────────────────────────────────────────

const UPSTREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Timeout for direct upstream fetches. Live HLS CDNs (e.g. Akamai) long-poll
 * at the live edge — holding the request up to one segment duration (~6 s)
 * before responding. 20 s matches the proxy timeout and gives enough headroom.
 */
const FETCH_TIMEOUT_MS = 20_000;
/**
 * Timeout for proxied fetches (HTTP CONNECT tunnel + TLS handshake + VPN latency
 * on top of the normal request). Must stay well above undici's internal connect
 * timeout so our AbortSignal fires first and the error is classified as timedOut.
 * 30 s gives slow VPN exit nodes headroom without hanging the player too long.
 */
const FETCH_TIMEOUT_PROXY_MS = 30_000;
const UPSTREAM_MAX_ATTEMPTS = 2;
/** Root playlist bootstrap can be slow on overloaded IPTV origins/CDNs. */
const BOOTSTRAP_FETCH_TIMEOUT_MS = 45_000;
const BOOTSTRAP_FETCH_TIMEOUT_PROXY_MS = 60_000;
const BOOTSTRAP_MAX_ATTEMPTS = 3;

/**
 * DVR ffmpeg hits this relay as the only client. Upstream HLS can long-pause on slow
 * CDNs/VPN; short timeouts + circuit breaker 502s abort the encode — use generous limits
 * and **no** breaker for these sessions (see `recordingRelay` below).
 */
const RECORDING_FETCH_TIMEOUT_MS = 95_000;
const RECORDING_FETCH_TIMEOUT_PROXY_MS = 130_000;
const RECORDING_UPSTREAM_MAX_ATTEMPTS = 3;
/** Progressive VOD/episode file downloads can run for a long time. */
const DOWNLOAD_FETCH_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/** Maximum number of 3xx hops before giving up. */
const MAX_REDIRECT_HOPS = 10;

/**
 * Provider redirectors occasionally assign a CDN hostname that accepts no TCP
 * connections. Undici's default connect timeout is 10 seconds, which compounds
 * badly with player and relay retries. A shared dispatcher also keeps working
 * CDN connections warm between manifest and segment requests.
 */
const DIRECT_UPSTREAM_DISPATCHER = new Agent({
  connectTimeout: 4_000,
  // One open MPEG-TS request per live viewer plus HLS/VOD bursts. Keep enough
  // capacity for 100 concurrent channels without serializing at the origin.
  connections: 256,
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 120_000,
});

/** A pinned media-playlist CDN should answer quickly; otherwise return to the provider router. */
const PINNED_ROOT_TIMEOUT_MS = 6_000;
const PINNED_ROOT_TIMEOUT_PROXY_MS = 15_000;

// ─── helpers ──────────────────────────────────────────────────────────────────

function proxyMode(
  hParam: string | null,
  uParam: string | null,
): "hash" | "u_param" | "root" {
  if (hParam) return "hash";
  if (uParam) return "u_param";
  return "root";
}

function resourceKindFromUrl(url: string): "segment" | "playlist" | "key" | "other" {
  if (/\.(?:ts|m4s|aac|ac3)(\?|$)/i.test(url)) return "segment";
  if (/\.m3u8(\?|$)/i.test(url)) return "playlist";
  if (/\.key(\?|$)/i.test(url)) return "key";
  return "other";
}

function pickUpstreamDiagHeaders(res: Response): Record<string, string> {
  const names = ["content-type", "cache-control", "server", "cf-ray", "x-cache", "age", "via"] as const;
  const out: Record<string, string> = {};
  for (const n of names) {
    const v = res.headers.get(n);
    if (v) out[n] = v;
  }
  return out;
}

/**
 * Build the base headers to forward upstream. Cookies are intentionally
 * omitted here — they are injected per-hop inside fetchFollowingRedirects
 * so each hop gets cookies scoped to its own origin.
 */
function buildBaseHeaders(inReq: Request, refererUrl: string): Headers {
  const out = new Headers({
    "User-Agent": UPSTREAM_UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  });
  try {
    new URL(refererUrl);
    out.set("Referer", refererUrl);
  } catch {
    /* ignore invalid referer */
  }
  const range = inReq.headers.get("range");
  if (range) out.set("Range", range);
  const ifRange = inReq.headers.get("if-range");
  if (ifRange) out.set("If-Range", ifRange);
  return out;
}

function forwardUpstreamHeaders(upstream: Response): Headers {
  const h = new Headers();
  for (const k of [
    "content-type",
    // content-length intentionally omitted: Next.js 16 miscalculates it for ArrayBuffer bodies,
    // causing a content-length mismatch that Cloudflare treats as a 520. We set it explicitly
    // to buf.byteLength at the call site instead.
    "cache-control",
    "accept-ranges",
    "content-range",
    "etag",
    "last-modified",
  ]) {
    const v = upstream.headers.get(k);
    if (v) h.set(k, v);
  }
  return h;
}

function forwardPassthroughHeaders(upstream: Response): Headers {
  const h = forwardUpstreamHeaders(upstream);
  const len = upstream.headers.get("content-length");
  if (len) h.set("content-length", len);
  return h;
}

function headersRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

type CacheDiagnosticState = "HIT" | "MISS" | "COALESCED" | "STALE" | "BYPASS";

function setCacheDiagnostics(
  headers: Headers,
  state: CacheDiagnosticState,
  cacheId: string,
): Headers {
  headers.set("X-Zende-Cache-Status", state);
  headers.set("X-Zende-Cache-Id", cacheId);
  return headers;
}

function sharedCacheResponse(
  cached: SharedStreamResponse,
  state: "HIT" | "COALESCED",
  cacheId: string,
): NextResponse {
  const headers = new Headers(cached.headers);
  headers.set("Content-Length", String(cached.body.byteLength));
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Zende-Stream-Cache", state);
  setCacheDiagnostics(headers, state, cacheId);
  const body = cached.body.buffer.slice(
    cached.body.byteOffset,
    cached.body.byteOffset + cached.body.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(body, { status: cached.status, headers });
}

async function sharedManifestResponse(input: {
  manifest: SharedManifestValue;
  state: "HIT" | "COALESCED" | "MISS" | "STALE";
  origin: string;
  sessionId: string;
  session: StreamSessionRecord;
  cacheId: string;
}): Promise<NextResponse> {
  const { manifest, state, origin, sessionId, session, cacheId } = input;
  rememberSharedRootPin(session.upstreamRootUrl, manifest.effectiveUrl);

  // Persist only the aliases present in this snapshot. persistUrlAliases merges
  // them with the session row, so cached media remains addressable without
  // repeatedly writing the session's entire historical alias map.
  const aliasSink = new Map<string, string>();
  const refererSink = new Map<string, string>();
  const rewritten = rewriteM3u8Playlist({
    body: manifest.body,
    playlistFetchUrl: manifest.effectiveUrl,
    origin,
    sessionId,
    aliasSink,
    refererSink,
  });
  await persistUrlAliases(sessionId, aliasSink, refererSink, {
    playlistRefererUrl: manifest.effectiveUrl,
  });
  const headers = setCacheDiagnostics(
    new Headers({
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "private, no-store",
      "X-Zende-Manifest-Cache": state,
    }),
    state,
    cacheId,
  );
  return new NextResponse(rewritten, {
    status: 200,
    headers,
  });
}

function attachmentFilename(title: string, url: string): string {
  let ext = "mp4";
  try {
    const path = new URL(url).pathname;
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    if (m?.[1]) ext = m[1].toLowerCase();
  } catch {
    /* keep default */
  }
  const safe =
    title
      .replace(/[^\w\s.-]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "episode";
  return `${safe}.${ext}`;
}

/** True when buffer looks like an MPEG-TS segment (sync byte). */
function looksLikeTsPacket(buf: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buf);
  return u8.length >= 188 && u8[0] === 0x47;
}

type FetchResult = {
  response: Response;
  /** Final URL after following all redirects. */
  effectiveUrl: string;
  /** Whether any Set-Cookie headers were merged into the jar. */
  jarUpdated: boolean;
};

type FetchAttemptLogger = {
  onAttemptStart?: (attempt: number, maxAttempts: number) => void;
  onAttemptSuccess?: (
    attempt: number,
    maxAttempts: number,
    elapsedMs: number,
    result: FetchResult,
  ) => void;
  onAttemptError?: (
    attempt: number,
    maxAttempts: number,
    elapsedMs: number,
    error: unknown,
  ) => void;
};

/**
 * Fetches `startUrl` following redirects manually so that:
 * - Set-Cookie headers on every 3xx response are captured into `jar`
 * - Each hop sends cookies from `jar` scoped to that hop's origin
 * - A dead upstream is aborted by `signal` (AbortSignal.timeout)
 * - When `proxyAgent` is set, ALL hops use the proxy — no direct connections.
 *
 * This mirrors what a real browser does and is necessary for streams
 * where the CDN sets auth cookies during the redirect chain.
 */
async function fetchFollowingRedirects(
  startUrl: string,
  baseHeaders: Headers,
  jar: CookieJar,
  signal: AbortSignal,
  proxyAgent?: Dispatcher,
): Promise<FetchResult> {
  let currentUrl = startUrl;
  let jarUpdated = false;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const headers = new Headers(baseHeaders);
    const cookieHdr = cookieHeaderForFetchUrl(currentUrl, jar);
    if (cookieHdr) headers.set("Cookie", cookieHdr);

    const fetchOpts: RequestInit & { dispatcher?: Dispatcher } = {
      redirect: "manual",
      headers,
      signal,
      dispatcher: proxyAgent ?? DIRECT_UPSTREAM_DISPATCHER,
    };

    const res = await undiciFetch(currentUrl, fetchOpts as Parameters<typeof undiciFetch>[1]) as unknown as Response;

    // Capture cookies from this hop regardless of whether it is a redirect.
    const sc = getSetCookieLines(res);
    if (sc.length > 0 && mergeSetCookieIntoJar(currentUrl, sc, jar)) {
      jarUpdated = true;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        // Redirect with no Location — treat as a final response.
        return { response: res, effectiveUrl: currentUrl, jarUpdated };
      }
      res.body?.cancel().catch(() => {});
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    return { response: res, effectiveUrl: currentUrl, jarUpdated };
  }

  throw new Error(`Too many redirects (>${MAX_REDIRECT_HOPS}) for ${startUrl}`);
}

async function fetchUpstreamWithRecordingRetries(
  fetchUrl: string,
  baseHeaders: Headers,
  cookieJar: CookieJar,
  timeoutMs: number,
  proxyAgent: Dispatcher | undefined,
  attemptLogger?: FetchAttemptLogger,
): Promise<FetchResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RECORDING_UPSTREAM_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, 450 * (attempt - 1)));
    }
    attemptLogger?.onAttemptStart?.(attempt, RECORDING_UPSTREAM_MAX_ATTEMPTS);
    const startedAt = Date.now();
    try {
      const result = await fetchFollowingRedirects(
        fetchUrl,
        baseHeaders,
        cookieJar,
        AbortSignal.timeout(timeoutMs),
        proxyAgent,
      );
      attemptLogger?.onAttemptSuccess?.(
        attempt,
        RECORDING_UPSTREAM_MAX_ATTEMPTS,
        Date.now() - startedAt,
        result,
      );
      return result;
    } catch (e) {
      lastErr = e;
      attemptLogger?.onAttemptError?.(
        attempt,
        RECORDING_UPSTREAM_MAX_ATTEMPTS,
        Date.now() - startedAt,
        e,
      );
      if (attempt === RECORDING_UPSTREAM_MAX_ATTEMPTS) throw e;
    }
  }
  throw lastErr;
}

async function fetchUpstreamWithRetries(
  fetchUrl: string,
  baseHeaders: Headers,
  cookieJar: CookieJar,
  timeoutMs: number,
  proxyAgent: Dispatcher | undefined,
  attempts: number,
  attemptLogger?: FetchAttemptLogger,
): Promise<FetchResult> {
  let lastErr: unknown;
  const maxAttempts = Math.max(1, attempts);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, 700 * (attempt - 1)));
    }
    attemptLogger?.onAttemptStart?.(attempt, maxAttempts);
    const startedAt = Date.now();
    try {
      const result = await fetchFollowingRedirects(
        fetchUrl,
        baseHeaders,
        cookieJar,
        AbortSignal.timeout(timeoutMs),
        proxyAgent,
      );
      attemptLogger?.onAttemptSuccess?.(
        attempt,
        maxAttempts,
        Date.now() - startedAt,
        result,
      );
      return result;
    } catch (e) {
      lastErr = e;
      attemptLogger?.onAttemptError?.(attempt, maxAttempts, Date.now() - startedAt, e);
      if (attempt === maxAttempts) throw e;
    }
  }
  throw lastErr;
}

// ─── route handler ────────────────────────────────────────────────────────────

/**
 * Proxies manifest, segments, and keys for a session. Query `u` = encoded absolute
 * upstream URL; `h` = short hash alias when URLs are too long for query strings.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  let { sessionId } = await context.params;
  sessionId = sessionId.replace(/\.(mp4|mkv|m3u8|ts)$/i, "");

  const session = await touchSession(sessionId);
  if (!session) {
    log.warn("Unknown or expired stream session", {
      sessionId,
      hint: "Clients must refresh /live bootstrap if idle beyond session TTL.",
    });
    return NextResponse.json(
      { error: "Unknown or expired session." },
      {
        status: 404,
        headers: setCacheDiagnostics(new Headers(), "BYPASS", "unresolved"),
      },
    );
  }

  let cacheLease: Extract<SharedStreamCacheLease, { kind: "leader" }> | undefined;
  let manifestLease: Extract<SharedManifestLease, { kind: "leader" }> | undefined;
  let responseCacheId = "unresolved";
  try {
  const urlObj = new URL(request.url);
  const uParam = urlObj.searchParams.get("u");
  const hParam = urlObj.searchParams.get("h");
  const asDownload = urlObj.searchParams.get("download") === "1";
  const isRootBootstrap = !hParam && !uParam;

  let fetchUrl: string;
  let rootFallbackUrl: string | undefined;
  if (hParam) {
    const resolved = resolveAlias(session, hParam);
    if (!resolved) {
      log.warn("Unknown URL alias (hash not in session map)", {
        sessionId,
        hash: hParam,
        aliasCount: session.urlAliases.size,
      });
      return NextResponse.json(
        { error: "Bad alias." },
        {
          status: 400,
          headers: setCacheDiagnostics(new Headers(), "BYPASS", "unresolved"),
        },
      );
    }
    fetchUrl = resolved;
  } else if (uParam) {
    try {
      fetchUrl = decodeURIComponent(uParam);
    } catch {
      return NextResponse.json(
        { error: "Bad URL encoding." },
        {
          status: 400,
          headers: setCacheDiagnostics(new Headers(), "BYPASS", "unresolved"),
        },
      );
    }
    if (!/^https?:\/\//i.test(fetchUrl)) {
      return NextResponse.json(
        { error: "Invalid target URL." },
        {
          status: 400,
          headers: setCacheDiagnostics(new Headers(), "BYPASS", "unresolved"),
        },
      );
    }
  } else {
    // Never prefer a session-local redirect token here. This provider rotates
    // tokens globally per account/channel, so an older session token can freeze
    // every other viewer. The process-wide pin is the single source of truth.
    const pinnedRootUrl = getSharedRootPin(session.upstreamRootUrl);
    if (
      pinnedRootUrl &&
      pinnedRootUrl !== session.upstreamRootUrl &&
      /^https?:\/\//i.test(pinnedRootUrl)
    ) {
      fetchUrl = pinnedRootUrl;
      rootFallbackUrl = session.upstreamRootUrl;
    } else {
      fetchUrl = session.upstreamRootUrl;
    }
  }

  if (asDownload && !isProgressiveMediaUrl(fetchUrl)) {
    return NextResponse.json(
      { error: "Only progressive episode/movie files can be downloaded." },
      {
        status: 400,
        headers: setCacheDiagnostics(new Headers(), "BYPASS", "unresolved"),
      },
    );
  }

  if (!hParam && !uParam) {
    log.info("stream proxy bootstrap (master/root playlist)", {
      sessionId: sessionId.slice(0, 14),
      upstreamHost: (() => {
        try {
          return new URL(session.upstreamRootUrl).hostname;
        } catch {
          return "(bad-url)";
        }
      })(),
      pinnedCdn: Boolean(rootFallbackUrl),
      ua: request.headers.get("user-agent")?.slice(0, 140),
    });
  }

  // touchSession returns a fresh object parsed from the DB row on every call,
  // so there is no sharing between concurrent requests — no deep copy needed.
  const cookieJar: CookieJar = session.cookieJar;

  // Build proxy agent once per request — cheap construction, no persistent state.
  // When set, EVERY upstream fetch (manifest, segment, key) goes through the proxy.
  const proxyAgent = session.proxyConfig ? buildProxyAgent(session.proxyConfig) : undefined;

  const refererFromHash =
    (hParam ? session.aliasReferers.get(hParam)?.trim() : undefined) || undefined;
  const refererForProxiedFetch = isRootBootstrap
    ? session.upstreamRootUrl
    : refererFromHash ||
      session.lastRefererUrl?.trim() ||
      session.upstreamRootUrl;

  const mode = proxyMode(hParam, uParam);
  log.debug("Proxy upstream fetch", {
    sessionId,
    mode,
    hash: hParam ?? undefined,
    resourceKind: resourceKindFromUrl(fetchUrl),
    fetchUrl: safeUrl(fetchUrl),
    referer: safeUrl(refererForProxiedFetch),
    refererSource: refererFromHash
      ? "aliasReferers"
      : session.lastRefererUrl?.trim()
        ? "lastRefererUrl"
        : "upstreamRootUrl",
  });

  const recordingRelay = session.title === DVR_RECORDING_SESSION_TITLE;
  const fetchTimeoutMs = asDownload
    ? DOWNLOAD_FETCH_TIMEOUT_MS
    : recordingRelay
      ? proxyAgent
        ? RECORDING_FETCH_TIMEOUT_PROXY_MS
        : RECORDING_FETCH_TIMEOUT_MS
      : isRootBootstrap
        ? proxyAgent
          ? BOOTSTRAP_FETCH_TIMEOUT_PROXY_MS
          : BOOTSTRAP_FETCH_TIMEOUT_MS
        : proxyAgent
          ? FETCH_TIMEOUT_PROXY_MS
          : FETCH_TIMEOUT_MS;

  const baseHeaders = buildBaseHeaders(request, refererForProxiedFetch);
  const resourceKind = resourceKindFromUrl(fetchUrl);
  const origin = getRequestOrigin(request);
  responseCacheId = isRootBootstrap
    ? sharedManifestCacheKey(session.upstreamRootUrl)
    : sharedStreamCacheKey({
        channelUrl: session.upstreamRootUrl,
        url: fetchUrl,
        resourceKind:
          resourceKind === "segment" || resourceKind === "key"
            ? resourceKind
            : "other",
        range: request.headers.get("range"),
      });

  if (isRootBootstrap && !asDownload) {
    const manifestKey = responseCacheId;
    let alreadyWaited = false;
    while (true) {
      const lease = acquireSharedManifest(manifestKey);
      if (lease.kind === "hit") {
        log.info("Shared manifest cache hit", {
          sessionId,
          upstreamRoot: safeUrl(session.upstreamRootUrl),
          cacheId: manifestKey,
        });
        return sharedManifestResponse({
          manifest: lease.value,
          state: "HIT",
          origin,
          sessionId,
          session,
          cacheId: manifestKey,
        });
      }
      if (lease.kind === "leader") {
        manifestLease = lease;
        break;
      }
      const joined = await lease.value;
      if (joined) {
        log.info("Shared manifest request coalesced", {
          sessionId,
          upstreamRoot: safeUrl(session.upstreamRootUrl),
          cacheId: manifestKey,
        });
        return sharedManifestResponse({
          manifest: joined,
          state: "COALESCED",
          origin,
          sessionId,
          session,
          cacheId: manifestKey,
        });
      }
      if (alreadyWaited) break;
      alreadyWaited = true;
    }
  }

  const cacheEligible =
    !asDownload &&
    !request.headers.get("range") &&
    !isProgressiveMediaUrl(fetchUrl) &&
    (resourceKind === "segment" || resourceKind === "key");
  if (cacheEligible) {
    const cacheKey = responseCacheId;
    let alreadyWaited = false;
    while (true) {
      const lease = acquireSharedStreamResponse(cacheKey);
      if (lease.kind === "hit") {
        log.info("Shared stream cache hit", {
          sessionId,
          resourceKind,
          requestUrl: safeUrl(fetchUrl),
          byteLength: lease.value.body.byteLength,
          cacheId: cacheKey,
        });
        return sharedCacheResponse(lease.value, "HIT", cacheKey);
      }
      if (lease.kind === "leader") {
        cacheLease = lease;
        break;
      }
      const joined = await lease.value;
      if (joined) {
        log.info("Shared stream request coalesced", {
          sessionId,
          resourceKind,
          requestUrl: safeUrl(fetchUrl),
          byteLength: joined.body.byteLength,
          cacheId: cacheKey,
        });
        return sharedCacheResponse(joined, "COALESCED", cacheKey);
      }
      if (alreadyWaited) break;
      alreadyWaited = true;
    }
  }

  // Circuit breaker: replay the cached status instantly instead of re-fetching.
  // Skip for DVR ffmpeg relay — a single client would otherwise get stuck on 502
  // while upstream recovers.
  if (!recordingRelay && !isRootBootstrap) {
    const cachedStatus = breakerStatus(sessionId, fetchUrl);
    if (cachedStatus !== null) {
      cacheLease?.fail();
      log.debug("Circuit breaker: replaying cached status", {
        sessionId,
        fetchUrl: safeUrl(fetchUrl),
        status: cachedStatus,
      });
      return new NextResponse(null, {
        status: cachedStatus,
        headers: setCacheDiagnostics(new Headers(), "BYPASS", responseCacheId),
      });
    }
  }
  let activeAttemptTimeoutMs = fetchTimeoutMs;
  const attemptLogger: FetchAttemptLogger = {
    onAttemptStart: (attempt, maxAttempts) => {
      log.info("Upstream fetch attempt started", {
        sessionId,
        mode,
        resourceKind: resourceKindFromUrl(fetchUrl),
        attempt,
        maxAttempts,
        timeoutMs: activeAttemptTimeoutMs,
        recordingRelay,
        isRootBootstrap,
        usingProxy: Boolean(proxyAgent),
        requestUrl: safeUrl(fetchUrl),
      });
    },
    onAttemptSuccess: (attempt, maxAttempts, elapsedMs, result) => {
      log.info("Upstream fetch attempt succeeded", {
        sessionId,
        mode,
        resourceKind: resourceKindFromUrl(fetchUrl),
        attempt,
        maxAttempts,
        elapsedMs,
        status: result.response.status,
        requestUrl: safeUrl(fetchUrl),
        effectiveUrl:
          result.effectiveUrl !== fetchUrl ? safeUrl(result.effectiveUrl) : undefined,
        jarUpdated: result.jarUpdated,
      });
    },
    onAttemptError: (attempt, maxAttempts, elapsedMs, error) => {
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      const cause =
        error instanceof Error && (error as Error & { cause?: unknown }).cause;
      log.warn("Upstream fetch attempt failed", {
        sessionId,
        mode,
        resourceKind: resourceKindFromUrl(fetchUrl),
        attempt,
        maxAttempts,
        elapsedMs,
        timedOut: isTimeout,
        err: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        cause:
          cause instanceof Error
            ? `${cause.name}: ${cause.message}`
            : cause
              ? String(cause)
              : undefined,
        requestUrl: safeUrl(fetchUrl),
      });
    },
  };

  let upstream: Response;
  let effectiveUrl: string;
  try {
    const retryAttempts = isRootBootstrap
      ? BOOTSTRAP_MAX_ATTEMPTS
      : UPSTREAM_MAX_ATTEMPTS;
    let result: FetchResult | undefined;

    // Once a provider redirect has produced a working media-playlist URL, reuse
    // that CDN directly for playlist refreshes. This avoids being randomly sent
    // to a dead shard on every HLS reload. If the pinned URL expires or fails,
    // immediately return to the canonical provider URL and establish a new pin.
    if (rootFallbackUrl && !recordingRelay) {
      let pinnedFailure: unknown;
      try {
        activeAttemptTimeoutMs = proxyAgent
          ? PINNED_ROOT_TIMEOUT_PROXY_MS
          : PINNED_ROOT_TIMEOUT_MS;
        const pinnedResult = await fetchUpstreamWithRetries(
          fetchUrl,
          baseHeaders,
          cookieJar,
          proxyAgent ? PINNED_ROOT_TIMEOUT_PROXY_MS : PINNED_ROOT_TIMEOUT_MS,
          proxyAgent,
          1,
          attemptLogger,
        );
        if (pinnedResult.response.ok) {
          result = pinnedResult;
        } else {
          pinnedFailure = new Error(`Pinned CDN returned ${pinnedResult.response.status}`);
          pinnedResult.response.body?.cancel().catch(() => {});
        }
      } catch (err) {
        pinnedFailure = err;
      }

      if (!result) {
        forgetSharedRootPin(session.upstreamRootUrl, fetchUrl);
        log.warn("Pinned playlist CDN unavailable; retrying provider origin", {
          sessionId,
          pinnedUrl: safeUrl(fetchUrl),
          originUrl: safeUrl(rootFallbackUrl),
          reason:
            pinnedFailure instanceof Error
              ? `${pinnedFailure.name}: ${pinnedFailure.message}`
              : String(pinnedFailure),
        });
        fetchUrl = rootFallbackUrl;
        activeAttemptTimeoutMs = fetchTimeoutMs;
      }
    }

    if (!result && isRootBootstrap && fetchUrl === session.upstreamRootUrl) {
      // The provider's canonical URL issues a rotating CDN token. Only one
      // request may refresh it; followers wait, then fetch the winning token.
      // This prevents a second browser from invalidating the first browser.
      for (let coordinationAttempt = 0; coordinationAttempt < 2 && !result; coordinationAttempt++) {
        const refresh = acquireSharedRootRefresh(session.upstreamRootUrl);
        if (refresh.kind === "wait") {
          const sharedPin = await refresh.value;
          if (sharedPin) {
            fetchUrl = sharedPin;
            activeAttemptTimeoutMs = proxyAgent
              ? PINNED_ROOT_TIMEOUT_PROXY_MS
              : PINNED_ROOT_TIMEOUT_MS;
            const joinedResult = await fetchUpstreamWithRetries(
              fetchUrl,
              baseHeaders,
              cookieJar,
              activeAttemptTimeoutMs,
              proxyAgent,
              1,
              attemptLogger,
            );
            if (joinedResult.response.ok) {
              result = joinedResult;
              break;
            }
            joinedResult.response.body?.cancel().catch(() => {});
            forgetSharedRootPin(session.upstreamRootUrl, sharedPin);
          }
          fetchUrl = session.upstreamRootUrl;
          activeAttemptTimeoutMs = fetchTimeoutMs;
          continue;
        }

        try {
          activeAttemptTimeoutMs = fetchTimeoutMs;
          const refreshed = recordingRelay
            ? await fetchUpstreamWithRecordingRetries(
                session.upstreamRootUrl,
                baseHeaders,
                cookieJar,
                fetchTimeoutMs,
                proxyAgent,
                attemptLogger,
              )
            : await fetchUpstreamWithRetries(
                session.upstreamRootUrl,
                baseHeaders,
                cookieJar,
                fetchTimeoutMs,
                proxyAgent,
                retryAttempts,
                attemptLogger,
              );
          if (refreshed.response.ok) {
            refresh.complete(refreshed.effectiveUrl);
          } else {
            refresh.complete(null);
          }
          result = refreshed;
        } catch (error) {
          refresh.complete(null);
          throw error;
        }
      }
    }

    if (!result) {
      result = recordingRelay
        ? await fetchUpstreamWithRecordingRetries(
            fetchUrl,
            baseHeaders,
            cookieJar,
            fetchTimeoutMs,
            proxyAgent,
            attemptLogger,
          )
        : await fetchUpstreamWithRetries(
            fetchUrl,
            baseHeaders,
            cookieJar,
            fetchTimeoutMs,
            proxyAgent,
            retryAttempts,
            attemptLogger,
          );
    }
    upstream = result.response;
    effectiveUrl = result.effectiveUrl;
    if (result.jarUpdated) {
      // Best-effort — don't let a DB write failure block the stream response.
      persistCookieJar(sessionId, cookieJar).catch(() => {});
    }
  } catch (err) {
    cacheLease?.fail();
    const staleManifest = manifestLease?.fail();
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    const cause = err instanceof Error && (err as Error & { cause?: unknown }).cause;
    log.warn("Upstream fetch threw", {
      sessionId,
      mode,
      fetchUrl: safeUrl(fetchUrl),
      referer: safeUrl(refererForProxiedFetch),
      usingProxy: session.proxyConfig
        ? `${session.proxyConfig.vpnType ?? "direct"} ${session.proxyConfig.host}:${session.proxyConfig.port}`
        : "none",
      err: err instanceof Error ? err.message : String(err),
      cause: cause instanceof Error ? `${cause.name}: ${cause.message}` : cause ? String(cause) : undefined,
      timedOut: isTimeout,
      recordingRelay,
    });
    if (staleManifest) {
      log.warn("Serving stale shared manifest after upstream fetch failure", {
        sessionId,
        upstreamRoot: safeUrl(session.upstreamRootUrl),
      });
      return sharedManifestResponse({
        manifest: staleManifest,
        state: "STALE",
        origin,
        sessionId,
        session,
        cacheId: responseCacheId,
      });
    }
    if (!recordingRelay && !isRootBootstrap) {
      // Trip the breaker with 502 (network failure). Mark transient so the
      // player can retry after 8 s once the VPN reconnects.
      breakerTrip(sessionId, fetchUrl, 502, /* transient */ true);
    }
    return NextResponse.json(
      { error: isTimeout ? "Upstream timed out." : "Upstream fetch failed." },
      {
        status: 502,
        headers: setCacheDiagnostics(new Headers(), "BYPASS", responseCacheId),
      },
    );
  }

  if (!upstream.ok) {
    cacheLease?.fail();
    const staleManifest = manifestLease?.fail();
    log.warn("Upstream status not OK", {
      status: upstream.status,
      statusText: upstream.statusText,
      sessionId,
      mode,
      hash: hParam ?? undefined,
      resourceKind: resourceKindFromUrl(fetchUrl),
      requestUrl: safeUrl(fetchUrl),
      effectiveUrl: effectiveUrl !== fetchUrl ? safeUrl(effectiveUrl) : undefined,
      referer: safeUrl(refererForProxiedFetch),
      refererSource: refererFromHash
        ? "aliasReferers"
        : session.lastRefererUrl?.trim()
          ? "lastRefererUrl"
          : "upstreamRootUrl",
      sentCookie: Boolean(cookieHeaderForFetchUrl(fetchUrl, cookieJar)),
      upstream: pickUpstreamDiagHeaders(upstream),
      recordingRelay,
    });
    upstream.body?.cancel().catch(() => {});
    if (staleManifest) {
      log.warn("Serving stale shared manifest after upstream status", {
        sessionId,
        upstreamStatus: upstream.status,
        upstreamRoot: safeUrl(session.upstreamRootUrl),
      });
      return sharedManifestResponse({
        manifest: staleManifest,
        state: "STALE",
        origin,
        sessionId,
        session,
        cacheId: responseCacheId,
      });
    }
    // 403 = auth/IP block — persistent. Trip the breaker with the real status so
    // hls.js sees 403 and falls back to another variant instead of retrying at speed.
    // 5xx = upstream hard error — same treatment.
    if (
      !recordingRelay &&
      !isRootBootstrap &&
      (upstream.status === 403 || upstream.status >= 500)
    ) {
      breakerTrip(sessionId, fetchUrl, upstream.status);
    }
    // Always forward the real upstream status with an empty body.
    // hls.js understands 403 (auth), 404 (gone), 5xx (error) — never send JSON
    // because the player expects binary or playlist data, not an error envelope.
    // A provider root 403 is a transient live-relay failure, not authorization
    // for this already-approved viewer. Do not expose it as a fatal HLS auth
    // response; hls.js can retry a 503 while the shared channel relay recovers.
    const downstreamStatus = isRootBootstrap && upstream.status === 403 ? 503 : upstream.status;
    const errorHeaders = setCacheDiagnostics(
      new Headers(isRootBootstrap ? { "Retry-After": "3" } : undefined),
      "BYPASS",
      responseCacheId,
    );
    return new NextResponse(null, {
      status: downstreamStatus,
      headers: errorHeaders,
    });
  }

  // Live `.ts` / VOD files — stream body through (arrayBuffer() hangs or OOMs).
  const ct = upstream.headers.get("content-type");
  if (
    upstream.body &&
    shouldStreamProxyPassthrough({
      request,
      fetchUrl,
      isRootBootstrap,
      upstreamStatus: upstream.status,
      contentType: ct,
    })
  ) {
    manifestLease?.fail();
    log.info("stream proxy passthrough", {
      sessionId,
      fetchUrl: safeUrl(fetchUrl),
      status: upstream.status,
      contentType: ct ?? "(none)",
      range: request.headers.get("range") ?? undefined,
      progressive: isProgressiveMediaUrl(fetchUrl),
    });
    const h = forwardPassthroughHeaders(upstream);
    if (!h.get("content-type")) {
      if (isOpenEndedLiveMpegTsUrl(fetchUrl)) h.set("content-type", "video/mp2t");
      else if (isProgressiveMediaUrl(fetchUrl)) h.set("content-type", "video/mp4");
    }
    if (asDownload) {
      const filename = attachmentFilename(session.title, fetchUrl);
      h.set("Content-Disposition", `attachment; filename="${filename}"`);
      h.set("Cache-Control", "private, no-store");
    }
    const isLiveTsResilience = isRootBootstrap && isOpenEndedLiveMpegTsUrl(fetchUrl) && !asDownload && session.title !== DVR_RECORDING_SESSION_TITLE;

    let responseBody: ReadableStream<Uint8Array> = upstream.body;
    if (isLiveTsResilience) {
      log.info("wrapping mpeg-ts passthrough with resilient upstream", { sessionId, fetchUrl: safeUrl(fetchUrl) });
      const resilientFetch = async () => {
        const result = await fetchFollowingRedirects(
          fetchUrl,
          baseHeaders,
          cookieJar,
          AbortSignal.timeout(fetchTimeoutMs),
          proxyAgent
        );
        if (!result.response.ok || !result.response.body) {
          result.response.body?.cancel().catch(() => {});
          throw new Error(`Upstream returned ${result.response.status}`);
        }
        if (result.jarUpdated) {
          void persistCookieJar(sessionId, cookieJar);
        }
        return result.response.body;
      };

      responseBody = createResilientUpstream({
        fetchUpstream: resilientFetch,
        maxConsecutiveFailures: 5,
        initialBackoffMs: 50,
        maxBackoffMs: 500,
        label: sessionId,
        initialStream: upstream.body,
      });
      
      h.delete("content-length");
    }

    if (cacheLease) {
      const [clientBody, cacheBody] = responseBody.tee();
      h.set("X-Zende-Stream-Cache", "MISS");
      setCacheDiagnostics(h, "MISS", responseCacheId);
      void readSharedCacheBody(cacheBody)
        .then((body) => {
          cacheLease?.commit({
            status: upstream.status,
            headers: headersRecord(h),
            body,
          });
        })
        .catch(() => cacheLease?.fail());
      return new NextResponse(clientBody, { status: upstream.status, headers: h });
    }
    setCacheDiagnostics(h, "BYPASS", responseCacheId);
    return new NextResponse(responseBody, { status: upstream.status, headers: h });
  }

  const buf = await upstream.arrayBuffer();

  if (looksLikeTsPacket(buf)) {
    manifestLease?.fail();
    const h = forwardUpstreamHeaders(upstream);
    h.set("content-length", String(buf.byteLength));
    if (cacheLease) {
      h.set("X-Zende-Stream-Cache", "MISS");
      setCacheDiagnostics(h, "MISS", responseCacheId);
      cacheLease.commit({
        status: upstream.status,
        headers: headersRecord(h),
        body: new Uint8Array(buf),
      });
    } else {
      setCacheDiagnostics(h, "BYPASS", responseCacheId);
    }
    return new NextResponse(buf, { status: upstream.status, headers: h });
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  if (looksLikeHlsPlaylist(text, ct, effectiveUrl)) {
    cacheLease?.fail();
    const manifest: SharedManifestValue = {
      body: text,
      effectiveUrl,
      contentType: ct,
    };
    if (isRootBootstrap && manifestLease) {
      const snapshot = manifestLease.commit(manifest);
      return sharedManifestResponse({
        manifest: snapshot,
        state: "MISS",
        origin,
        sessionId,
        session,
        cacheId: responseCacheId,
      });
    }
    const aliasSink = new Map<string, string>();
    const refererSink = new Map<string, string>();
    const rewritten = rewriteM3u8Playlist({
      body: text,
      playlistFetchUrl: effectiveUrl,
      origin,
      sessionId,
      aliasSink,
      refererSink,
    });
    await persistUrlAliases(sessionId, aliasSink, refererSink, {
      playlistRefererUrl: effectiveUrl,
    });
    const playlistHeaders = setCacheDiagnostics(
      new Headers({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      }),
      "BYPASS",
      responseCacheId,
    );
    return new NextResponse(rewritten, {
      status: 200,
      headers: playlistHeaders,
    });
  }

  const respHeaders = forwardUpstreamHeaders(upstream);
  manifestLease?.fail();

  if (buf.byteLength <= 32) {
    // AES-128 keys are exactly 16 bytes — log hex so we can verify the CDN returned the real key.
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    log.info("Small binary response (possible AES key)", {
      sessionId,
      fetchUrl: safeUrl(fetchUrl),
      byteLength: buf.byteLength,
      contentType: ct ?? "(none)",
      hex,
    });
    // Ensure key responses carry an explicit binary content-type.
    if (!respHeaders.get("content-type")) {
      respHeaders.set("content-type", "application/octet-stream");
    }
  } else {
    // Large binary — log enough to confirm segments are flowing (size, CDN content-type, sync byte).
    const firstByte = new Uint8Array(buf)[0];
    log.info("Binary response (segment)", {
      sessionId,
      fetchUrl: safeUrl(fetchUrl),
      byteLength: buf.byteLength,
      contentType: ct ?? "(none)",
      // 0x47 = MPEG-TS sync byte; absent on AES-128 encrypted segments (expected).
      startsWithTsSync: firstByte === 0x47,
    });
  }

  respHeaders.set("content-length", String(buf.byteLength));
  if (cacheLease) {
    respHeaders.set("X-Zende-Stream-Cache", "MISS");
    setCacheDiagnostics(respHeaders, "MISS", responseCacheId);
    cacheLease.commit({
      status: upstream.status,
      headers: headersRecord(respHeaders),
      body: new Uint8Array(buf),
    });
  } else {
    setCacheDiagnostics(respHeaders, "BYPASS", responseCacheId);
  }
  return new NextResponse(buf, {
    status: upstream.status,
    headers: respHeaders,
  });
  } catch (err) {
    cacheLease?.fail();
    const staleManifest = manifestLease?.fail();
    if (staleManifest) {
      return sharedManifestResponse({
        manifest: staleManifest,
        state: "STALE",
        origin: getRequestOrigin(request),
        sessionId,
        session,
        cacheId: responseCacheId,
      });
    }
    log.error("stream proxy unexpected error", {
      sessionId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Stream proxy failed." },
      {
        status: 502,
        headers: setCacheDiagnostics(new Headers(), "BYPASS", responseCacheId),
      },
    );
  }
}
