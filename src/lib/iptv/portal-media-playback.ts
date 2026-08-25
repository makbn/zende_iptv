import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { hashStreamUrl } from "@/lib/health/url-hash";
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
import {
  findThreadfinRow,
  type ThreadfinContentKind,
} from "@/lib/threadfin/catalog";

const log = createServerLogger("iptv.portal-playback");

async function openPlaybackSession(args: {
  upstreamHref: string;
  title: string;
  logo?: string;
  group?: string;
  proxyConfig: Awaited<ReturnType<typeof getProxyForChannel>>;
  preserveMpegTs?: boolean;
}): Promise<string> {
  return createStreamSession({
    upstreamRootUrl: args.upstreamHref,
    title: args.title,
    logo: args.logo,
    group: args.group,
    proxyConfig: args.proxyConfig ?? undefined,
    normalizeXtreamLiveUrl: !args.preserveMpegTs,
  });
}

/**
 * Shared portal playback for `/live|movie|series/<user>/<pass>/<streamId>.ext`.
 * Resolves stream from the Threadfin full catalog (covers live + VOD + episodes).
 */
export async function handlePortalMediaPlayback(
  request: Request,
  args: {
    portalUser: string;
    portalPass: string;
    streamFile: string;
    kind: ThreadfinContentKind;
  },
): Promise<Response> {
  let username: string;
  let password: string;
  try {
    username = decodeURIComponent(args.portalUser);
    password = decodeURIComponent(args.portalPass);
  } catch {
    username = args.portalUser;
    password = args.portalPass;
  }

  const cred = await verifyIptvPortalLogin(username, password);
  if (!cred) {
    log.warn("playback unauthorized", {
      kind: args.kind,
      portalUser: username.slice(0, 48),
      streamPath: args.streamFile.slice(0, 64),
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const m = /^(\d+)\.[a-z0-9]+$/i.exec(args.streamFile.trim());
  if (!m) {
    return Response.json({ error: "Invalid stream path." }, { status: 400 });
  }

  const streamNum = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(streamNum) || streamNum < 1) {
    return Response.json({ error: "Invalid stream id." }, { status: 400 });
  }

  const row = await findThreadfinRow(args.kind, streamNum);
  if (!row) {
    return Response.json({ error: "Unknown stream." }, { status: 404 });
  }

  const upstreamHref = row.playUrl.trim();
  const requestedMpegTs = args.kind === "live" && /\.ts$/i.test(args.streamFile.trim());
  const relayUpstreamHref = requestedMpegTs
    ? upstreamHref.replace(/(\/live\/[^/]+\/[^/]+\/\d+)\.m3u8(?=\?|$)/i, "$1.ts")
    : upstreamHref;
  let upstream: URL;
  try {
    upstream = new URL(relayUpstreamHref);
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

  const cacheKey = `${cred.id}:${args.kind}:${streamNum}`;
  let sessionId = peekLivePlaybackSession(cacheKey);
  let sessionFresh = false;

  if (!sessionId) {
    try {
      sessionId = await openPlaybackSession({
        upstreamHref: upstream.href,
        title: row.name,
        logo: row.tvgLogo,
        group: row.groupTitle,
        proxyConfig,
        preserveMpegTs: requestedMpegTs,
      });
      rememberLivePlaybackSession(cacheKey, sessionId);
      sessionFresh = true;
    } catch {
      return Response.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
    }
  }

  log.info("playback start", {
    kind: args.kind,
    streamNum,
    channel: row.name.slice(0, 80),
    upstreamHost: upstream.hostname,
    sessionCached: !sessionFresh,
    sessionPrefix: sessionId.slice(0, 12),
  });

  let response = await invokeStreamProxyGet(request, sessionId);

  if (response.status === 404 && !sessionFresh) {
    forgetLivePlaybackSession(cacheKey);
    try {
      sessionId = await openPlaybackSession({
        upstreamHref: upstream.href,
        title: row.name,
        logo: row.tvgLogo,
        group: row.groupTitle,
        proxyConfig,
        preserveMpegTs: requestedMpegTs,
      });
      rememberLivePlaybackSession(cacheKey, sessionId);
      response = await invokeStreamProxyGet(request, sessionId);
    } catch {
      return Response.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
    }
  }

  return response;
}
