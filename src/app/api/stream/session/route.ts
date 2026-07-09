import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerLogger } from "@/core/logging/server";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import { hashStreamUrl } from "@/lib/health/url-hash";
import { getProxyForChannel, ProxyNotReadyError } from "@/lib/proxies/proxy-store";
import { applyPublicCorsProxyUnwrap } from "@/lib/stream/public-cors-proxy-url";
import { normalizeXtreamLivePlaybackUrl } from "@/lib/stream/playback-url";
import { redactStreamUrlForLog } from "@/lib/stream/redact-stream-url";
import {
  enrichPlaybackSearchMeta,
  inferContentKindFromUrl,
  resolvePlaybackDurationSeconds,
} from "@/lib/playback/resolve-duration";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import { createStreamSession } from "@/lib/stream/stream-session-store";

export const runtime = "nodejs";
const log = createServerLogger("api.stream.session");

const bodySchema = z.object({
  url: z.string().min(4).max(8192),
  title: z.string().max(512).optional(),
  logo: z.string().max(8192).optional(),
  group: z.string().max(512).optional(),
  /**
   * When true (default), URLs shaped like `https://cors-proxy…/http://real-host/…` are
   * rewritten to `http://real-host/…` before the server fetches them (browser CORS bridges
   * are unnecessary for our proxy). Set false to keep the catalog URL exactly as given.
   */
  unwrapPublicCorsProxyUrls: z.boolean().optional(),
  /**
   * Seed cookie jar for the stream's origin — e.g. authenticated session
   * cookies extracted from a browser DevTools session. Name → value.
   */
  cookies: z.record(z.string(), z.string()).optional(),
  meta: z
    .object({
      contentKind: z.enum(["live", "movie", "episode"]).optional(),
      durationSeconds: z.number().positive().optional(),
      seriesId: z.string().max(64).optional(),
      seriesTitle: z.string().max(512).optional(),
      season: z.string().max(16).optional(),
      episodeNum: z.string().max(16).optional(),
      episodeTitle: z.string().max(512).optional(),
      episodeIndex: z.number().int().min(0).optional(),
      searchTitle: z.string().max(512).optional(),
      year: z.string().max(8).optional(),
      imdbId: z.string().max(32).optional(),
    })
    .optional(),
});

/**
 * Registers an upstream HLS / stream URL and returns an opaque id used by `/watch?id=…`
 * and `/api/stream/proxy/[id]`. Requires auth when enabled (same as other APIs).
 */
export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    log.warn("Session create rejected: invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    log.warn("Session create rejected: schema validation failed", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rawUrl = parsed.data.url.trim();
  const unwrapPublicCorsProxyUrls =
    parsed.data.unwrapPublicCorsProxyUrls !== false;
  const resolvedUrl = applyPublicCorsProxyUnwrap(rawUrl, unwrapPublicCorsProxyUrls);
  const normalizedUrl = normalizeXtreamLivePlaybackUrl(resolvedUrl);
  if (normalizedUrl !== resolvedUrl) {
    log.info("Rewrote live .ts URL to .m3u8 for browser playback", {
      from: redactStreamUrlForLog(resolvedUrl),
      to: redactStreamUrlForLog(normalizedUrl),
    });
  }

  let upstream: URL;
  try {
    upstream = new URL(normalizedUrl);
  } catch {
    log.warn("Session create rejected: invalid stream URL", {
      rawUrlPreview: redactStreamUrlForLog(rawUrl),
    });
    return NextResponse.json({ error: "Invalid stream URL." }, { status: 400 });
  }
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    log.warn("Session create rejected: unsupported protocol", {
      protocol: upstream.protocol,
    });
    return NextResponse.json({ error: "Only http(s) streams are supported." }, { status: 400 });
  }

  // Channel / VPN routing uses the catalog URL hash (wrapped form if that is what is stored).
  const urlHash = await hashStreamUrl(rawUrl);
  let proxyConfig;
  try {
    proxyConfig = await getProxyForChannel(urlHash);
  } catch (err) {
    if (err instanceof ProxyNotReadyError) {
      log.warn("Session create blocked: proxy not ready", {
        urlHash,
        reason: err.message,
      });
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    log.error("Session create failed while resolving proxy", {
      urlHash,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }

  try {
    const started = Date.now();
    let meta: PlaybackSessionMeta = parsed.data.meta ?? {};
    const inferred = inferContentKindFromUrl(upstream.href);
    if (inferred) {
      if (!meta.contentKind || (meta.contentKind === "live" && inferred !== "live")) {
        meta = { ...meta, contentKind: inferred };
      }
    }
    const resolvedDuration = await resolvePlaybackDurationSeconds(upstream.href, meta);
    if (resolvedDuration && !meta.durationSeconds) {
      meta = { ...meta, durationSeconds: resolvedDuration };
    }
    meta = await enrichPlaybackSearchMeta(
      upstream.href,
      meta,
      (parsed.data.title ?? "").trim() || "Live",
    );

    const id = await createStreamSession({
      upstreamRootUrl: upstream.href,
      title: (parsed.data.title ?? "").trim() || "Live",
      logo: parsed.data.logo?.trim() || undefined,
      group: parsed.data.group?.trim() || undefined,
      cookies: parsed.data.cookies,
      proxyConfig: proxyConfig ?? undefined,
      meta,
    });
    log.info("Stream session created", {
      sessionId: id,
      upstreamHost: upstream.host,
      hasProxy: Boolean(proxyConfig),
      hasSeedCookies: Boolean(parsed.data.cookies && Object.keys(parsed.data.cookies).length > 0),
      unwrappedCorsProxyUrl: rawUrl !== resolvedUrl,
      elapsedMs: Date.now() - started,
    });
    return NextResponse.json({ id });
  } catch (err) {
    log.error("Session create failed", {
      upstreamHost: upstream.host,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
