import { NextResponse } from "next/server";
import { fetch as undiciFetch, type ProxyAgent } from "undici";

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
} from "@/lib/stream/stream-session-store";
import {
  looksLikeHlsPlaylist,
  rewriteM3u8Playlist,
} from "@/lib/stream/m3u8-rewrite";

export const runtime = "nodejs";

const log = createServerLogger("api.stream.proxy");

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

/**
 * DVR ffmpeg hits this relay as the only client. Upstream HLS can long-pause on slow
 * CDNs/VPN; short timeouts + circuit breaker 502s abort the encode — use generous limits
 * and **no** breaker for these sessions (see `recordingRelay` below).
 */
const RECORDING_FETCH_TIMEOUT_MS = 95_000;
const RECORDING_FETCH_TIMEOUT_PROXY_MS = 130_000;
const RECORDING_UPSTREAM_MAX_ATTEMPTS = 3;

/** Maximum number of 3xx hops before giving up. */
const MAX_REDIRECT_HOPS = 10;

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
  if (/\.ts(\?|$)/i.test(url)) return "segment";
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
  proxyAgent?: ProxyAgent,
): Promise<FetchResult> {
  let currentUrl = startUrl;
  let jarUpdated = false;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const headers = new Headers(baseHeaders);
    const cookieHdr = cookieHeaderForFetchUrl(currentUrl, jar);
    if (cookieHdr) headers.set("Cookie", cookieHdr);

    const fetchOpts: RequestInit & { dispatcher?: ProxyAgent } = {
      redirect: "manual",
      headers,
      signal,
    };
    if (proxyAgent) fetchOpts.dispatcher = proxyAgent;

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
  proxyAgent: ProxyAgent | undefined,
): Promise<FetchResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RECORDING_UPSTREAM_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, 450 * (attempt - 1)));
    }
    try {
      return await fetchFollowingRedirects(
        fetchUrl,
        baseHeaders,
        cookieJar,
        AbortSignal.timeout(timeoutMs),
        proxyAgent,
      );
    } catch (e) {
      lastErr = e;
      if (attempt === RECORDING_UPSTREAM_MAX_ATTEMPTS) throw e;
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
  const { sessionId } = await context.params;

  const session = await touchSession(sessionId);
  if (!session) {
    log.warn("Unknown or expired stream session", {
      sessionId,
      hint: "Clients must refresh /live bootstrap if idle beyond session TTL.",
    });
    return NextResponse.json(
      { error: "Unknown or expired session." },
      { status: 404 },
    );
  }

  try {
  const urlObj = new URL(request.url);
  const uParam = urlObj.searchParams.get("u");
  const hParam = urlObj.searchParams.get("h");

  let fetchUrl: string;
  if (hParam) {
    const resolved = resolveAlias(session, hParam);
    if (!resolved) {
      log.warn("Unknown URL alias (hash not in session map)", {
        sessionId,
        hash: hParam,
        aliasCount: session.urlAliases.size,
      });
      return NextResponse.json({ error: "Bad alias." }, { status: 400 });
    }
    fetchUrl = resolved;
  } else if (uParam) {
    try {
      fetchUrl = decodeURIComponent(uParam);
    } catch {
      return NextResponse.json({ error: "Bad URL encoding." }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(fetchUrl)) {
      return NextResponse.json({ error: "Invalid target URL." }, { status: 400 });
    }
  } else {
    fetchUrl = session.upstreamRootUrl;
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
  const refererForProxiedFetch =
    refererFromHash ||
    session.lastRefererUrl?.trim() ||
    session.upstreamRootUrl;

  const mode = proxyMode(hParam, uParam);
  log.debug("Proxy upstream fetch", {
    sessionId,
    mode,
    hash: hParam ?? undefined,
    resourceKind: resourceKindFromUrl(fetchUrl),
    fetchUrl,
    referer: refererForProxiedFetch,
    refererSource: refererFromHash
      ? "aliasReferers"
      : session.lastRefererUrl?.trim()
        ? "lastRefererUrl"
        : "upstreamRootUrl",
  });

  const recordingRelay = session.title === DVR_RECORDING_SESSION_TITLE;
  const fetchTimeoutMs = recordingRelay
    ? proxyAgent
      ? RECORDING_FETCH_TIMEOUT_PROXY_MS
      : RECORDING_FETCH_TIMEOUT_MS
    : proxyAgent
      ? FETCH_TIMEOUT_PROXY_MS
      : FETCH_TIMEOUT_MS;

  // Circuit breaker: replay the cached status instantly instead of re-fetching.
  // Skip for DVR ffmpeg relay — a single client would otherwise get stuck on 502
  // while upstream recovers.
  if (!recordingRelay) {
    const cachedStatus = breakerStatus(sessionId, fetchUrl);
    if (cachedStatus !== null) {
      log.debug("Circuit breaker: replaying cached status", { sessionId, fetchUrl, status: cachedStatus });
      return new NextResponse(null, { status: cachedStatus });
    }
  }

  const baseHeaders = buildBaseHeaders(request, refererForProxiedFetch);

  let upstream: Response;
  let effectiveUrl: string;
  try {
    const result = recordingRelay
      ? await fetchUpstreamWithRecordingRetries(
          fetchUrl,
          baseHeaders,
          cookieJar,
          fetchTimeoutMs,
          proxyAgent,
        )
      : await fetchFollowingRedirects(
          fetchUrl,
          baseHeaders,
          cookieJar,
          AbortSignal.timeout(fetchTimeoutMs),
          proxyAgent,
        );
    upstream = result.response;
    effectiveUrl = result.effectiveUrl;
    if (result.jarUpdated) {
      // Best-effort — don't let a DB write failure block the stream response.
      persistCookieJar(sessionId, cookieJar).catch(() => {});
    }
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    const cause = err instanceof Error && (err as Error & { cause?: unknown }).cause;
    log.warn("Upstream fetch threw", {
      sessionId,
      mode,
      fetchUrl,
      referer: refererForProxiedFetch,
      usingProxy: session.proxyConfig
        ? `${session.proxyConfig.vpnType ?? "direct"} ${session.proxyConfig.host}:${session.proxyConfig.port}`
        : "none",
      err: err instanceof Error ? err.message : String(err),
      cause: cause instanceof Error ? `${cause.name}: ${cause.message}` : cause ? String(cause) : undefined,
      timedOut: isTimeout,
      recordingRelay,
    });
    if (!recordingRelay) {
      // Trip the breaker with 502 (network failure). Mark transient so the
      // player can retry after 8 s once the VPN reconnects.
      breakerTrip(sessionId, fetchUrl, 502, /* transient */ true);
    }
    return NextResponse.json(
      { error: isTimeout ? "Upstream timed out." : "Upstream fetch failed." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    log.warn("Upstream status not OK", {
      status: upstream.status,
      statusText: upstream.statusText,
      sessionId,
      mode,
      hash: hParam ?? undefined,
      resourceKind: resourceKindFromUrl(fetchUrl),
      requestUrl: fetchUrl,
      effectiveUrl: effectiveUrl !== fetchUrl ? effectiveUrl : undefined,
      referer: refererForProxiedFetch,
      refererSource: refererFromHash
        ? "aliasReferers"
        : session.lastRefererUrl?.trim()
          ? "lastRefererUrl"
          : "upstreamRootUrl",
      sentCookie: Boolean(cookieHeaderForFetchUrl(fetchUrl, cookieJar)),
      upstream: pickUpstreamDiagHeaders(upstream),
      recordingRelay,
    });
    // 403 = auth/IP block — persistent. Trip the breaker with the real status so
    // hls.js sees 403 and falls back to another variant instead of retrying at speed.
    // 5xx = upstream hard error — same treatment.
    if (!recordingRelay && (upstream.status === 403 || upstream.status >= 500)) {
      breakerTrip(sessionId, fetchUrl, upstream.status);
    }
    // Always forward the real upstream status with an empty body.
    // hls.js understands 403 (auth), 404 (gone), 5xx (error) — never send JSON
    // because the player expects binary or playlist data, not an error envelope.
    upstream.body?.cancel().catch(() => {});
    return new NextResponse(null, { status: upstream.status });
  }

  const origin = getRequestOrigin(request);
  const ct = upstream.headers.get("content-type");
  const buf = await upstream.arrayBuffer();

  if (looksLikeTsPacket(buf)) {
    const h = forwardUpstreamHeaders(upstream);
    h.set("content-length", String(buf.byteLength));
    return new NextResponse(buf, { status: upstream.status, headers: h });
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  if (looksLikeHlsPlaylist(text, ct, effectiveUrl)) {
    const aliasSink = new Map(session.urlAliases);
    const refererSink = new Map(session.aliasReferers);
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
    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      },
    });
  }

  const respHeaders = forwardUpstreamHeaders(upstream);

  if (buf.byteLength <= 32) {
    // AES-128 keys are exactly 16 bytes — log hex so we can verify the CDN returned the real key.
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    log.info("Small binary response (possible AES key)", {
      sessionId,
      fetchUrl,
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
      fetchUrl,
      byteLength: buf.byteLength,
      contentType: ct ?? "(none)",
      // 0x47 = MPEG-TS sync byte; absent on AES-128 encrypted segments (expected).
      startsWithTsSync: firstByte === 0x47,
    });
  }

  respHeaders.set("content-length", String(buf.byteLength));
  return new NextResponse(buf, {
    status: upstream.status,
    headers: respHeaders,
  });
  } catch (err) {
    log.error("stream proxy unexpected error", {
      sessionId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Stream proxy failed." },
      { status: 502 },
    );
  }
}
