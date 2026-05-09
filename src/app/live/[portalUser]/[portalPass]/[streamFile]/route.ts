import { createServerLogger } from "@/core/logging/server";
import { hashStreamUrl } from "@/lib/health/url-hash";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
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

export const runtime = "nodejs";

const log = createServerLogger("iptv.live");

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

/**
 * Xtream-style live playback (`/live/<user>/<password>/<stream_id>.m3u8` or `.ts`).
 * Streams the same bytes as `/api/stream/proxy/[session]` without a redirect — many IPTV
 * players on iOS/Android do not follow 302 reliably for playlist URLs.
 */
export async function GET(
  request: Request,
  context: {
    params: Promise<{ portalUser: string; portalPass: string; streamFile: string }>;
  },
) {
  const { portalUser, portalPass, streamFile } = await context.params;

  let username: string;
  let password: string;
  try {
    username = decodeURIComponent(portalUser);
    password = decodeURIComponent(portalPass);
  } catch {
    username = portalUser;
    password = portalPass;
  }

  const cred = await verifyIptvPortalLogin(username, password);
  if (!cred) {
    log.warn("playback unauthorized", {
      portalUser: username.slice(0, 48),
      streamPath: streamFile.slice(0, 64),
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const m = /^(\d+)\.[a-z0-9]+$/i.exec(streamFile.trim());
  if (!m) {
    return Response.json({ error: "Invalid stream path." }, { status: 400 });
  }

  const streamNum = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(streamNum) || streamNum < 1) {
    return Response.json({ error: "Invalid stream id." }, { status: 400 });
  }

  const { streams } = await getAggregatedXtreamCatalog();
  const row = streams.find((x) => x.streamId === streamNum);
  if (!row) {
    return Response.json({ error: "Unknown stream." }, { status: 404 });
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

  const cacheKey = `${cred.id}:${streamNum}`;
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

  log.info("playback start", {
    streamNum,
    channel: row.channel.name.slice(0, 80),
    upstreamHost: upstream.hostname,
    sessionCached: !sessionFresh,
    sessionPrefix: sessionId.slice(0, 12),
    ua: request.headers.get("user-agent")?.slice(0, 120),
  });

  let response = await invokeStreamProxyGet(request, sessionId);

  if (response.status === 404 && !sessionFresh) {
    log.warn("playback session expired — recreating", {
      streamNum,
      sessionPrefix: sessionId.slice(0, 12),
    });
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
    log.warn("playback proxy returned error status", {
      streamNum,
      status: response.status,
      sessionPrefix: sessionId.slice(0, 12),
      ct: response.headers.get("content-type"),
    });
  } else {
    log.info("playback manifest ok", {
      streamNum,
      status: response.status,
      ct: response.headers.get("content-type"),
    });
  }

  return response;
}
