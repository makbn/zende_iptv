import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { hashStreamUrl } from "@/lib/health/url-hash";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import {
  forgetLivePlaybackSession,
  peekLivePlaybackSession,
  rememberLivePlaybackSession,
} from "@/lib/iptv/live-playback-session-cache";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import {
  ProxyNotReadyError,
  getProxyForChannel,
} from "@/lib/proxies/proxy-store";
import { invokeStreamProxyGet } from "@/lib/stream/invoke-stream-proxy-get";
import { createStreamSession } from "@/lib/stream/stream-session-store";

const log = createServerLogger("hdhr.stream");

async function openPlaybackSession(args: {
  upstreamHref: string;
  title: string;
  logo?: string;
  group?: string;
  proxyConfig: Awaited<ReturnType<typeof getProxyForChannel>>;
}): Promise<string> {
  return createStreamSession({
    upstreamRootUrl: args.upstreamHref,
    title: args.title,
    logo: args.logo,
    group: args.group,
    proxyConfig: args.proxyConfig ?? undefined,
  });
}

function parseGuideNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * HDHomeRun-style tune endpoint — Plex GETs the URL from `lineup.json` and expects
 * a continuous live stream (MPEG-TS or HLS) relayed through our stream proxy.
 */
export async function tuneHdhrChannel(
  request: Request,
  guideNumberRaw: string,
): Promise<Response> {
  const streamNum = parseGuideNumber(guideNumberRaw);
  if (streamNum == null) {
    return Response.json({ error: "Invalid guide number." }, { status: 400 });
  }

  const { streams } = await getAggregatedXtreamCatalog();
  const row = streams.find((x) => x.streamId === streamNum);
  if (!row) {
    return Response.json({ error: "Unknown channel." }, { status: 404 });
  }

  const upstreamHref = row.channel.url.trim();
  let upstream: URL;
  try {
    upstream = new URL(upstreamHref);
  } catch {
    return Response.json({ error: "Invalid upstream URL." }, { status: 502 });
  }
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    return Response.json({ error: "Unsupported stream scheme." }, { status: 502 });
  }

  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "video/mp2t",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const urlHash = await hashStreamUrl(upstream.href);
  let proxyConfig;
  try {
    proxyConfig = await getProxyForChannel(urlHash);
  } catch (err) {
    if (err instanceof ProxyNotReadyError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    return Response.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }

  const cacheKey = `hdhr:${streamNum}`;
  let sessionId = peekLivePlaybackSession(cacheKey);
  let sessionFresh = false;

  if (!sessionId) {
    try {
      sessionId = await openPlaybackSession({
        upstreamHref: upstream.href,
        title: row.channel.name,
        logo: row.channel.tvgLogo?.trim() || undefined,
        group: row.channel.groupTitle?.trim() || undefined,
        proxyConfig,
      });
      rememberLivePlaybackSession(cacheKey, sessionId);
      sessionFresh = true;
    } catch {
      return Response.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
    }
  }

  log.info("tune", {
    guideNumber: streamNum,
    channel: row.channel.name.slice(0, 80),
    upstreamHost: upstream.hostname,
    sessionCached: !sessionFresh,
    sessionPrefix: sessionId.slice(0, 12),
    ua: request.headers.get("user-agent")?.slice(0, 120),
  });

  let response = await invokeStreamProxyGet(request, sessionId);

  if (response.status === 404 && !sessionFresh) {
    forgetLivePlaybackSession(cacheKey);
    try {
      sessionId = await openPlaybackSession({
        upstreamHref: upstream.href,
        title: row.channel.name,
        logo: row.channel.tvgLogo?.trim() || undefined,
        group: row.channel.groupTitle?.trim() || undefined,
        proxyConfig,
      });
      rememberLivePlaybackSession(cacheKey, sessionId);
      response = await invokeStreamProxyGet(request, sessionId);
    } catch {
      return Response.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
    }
  }

  if (response.status >= 400) {
    log.warn("tune proxy error", {
      guideNumber: streamNum,
      status: response.status,
      sessionPrefix: sessionId.slice(0, 12),
    });
  }

  return response;
}
