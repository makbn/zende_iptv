import { handlePortalMediaPlayback } from "@/lib/iptv/portal-media-playback";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
import { findThreadfinRow } from "@/lib/threadfin/catalog";
import { createServerLogger } from "@/core/logging/server";
import { hashStreamUrl } from "@/lib/health/url-hash";
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

/**
 * Xtream-style live playback (`/live/<user>/<password>/<stream_id>.m3u8` or `.ts`).
 * Prefers Threadfin full-catalog stable ids; falls back to sequential get.php catalog.
 */
export async function GET(
  request: Request,
  context: {
    params: Promise<{ portalUser: string; portalPass: string; streamFile: string }>;
  },
) {
  const { portalUser, portalPass, streamFile } = await context.params;

  const m = /^(\d+)\.[a-z0-9]+$/i.exec(streamFile.trim());
  if (m) {
    const streamNum = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(streamNum) && streamNum >= 1) {
      const tf = await findThreadfinRow("live", streamNum);
      if (tf) {
        return handlePortalMediaPlayback(request, {
          portalUser,
          portalPass,
          streamFile,
          kind: "live",
        });
      }
    }
  }

  // Legacy sequential catalog (get.php / TiviMate)
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
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const cacheKey = `${cred.id}:agg:${streamNum}`;
  let sessionId = peekLivePlaybackSession(cacheKey);
  let sessionFresh = false;

  if (!sessionId) {
    try {
      sessionId = await createStreamSession({
        upstreamRootUrl: upstream.href,
        title: row.channel.name,
        logo: row.channel.tvgLogo?.trim() || undefined,
        group: row.channel.groupTitle?.trim() || undefined,
        proxyConfig: proxyConfig ?? undefined,
      });
      rememberLivePlaybackSession(cacheKey, sessionId);
      sessionFresh = true;
    } catch {
      return Response.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
    }
  }

  log.info("playback start (aggregated)", {
    streamNum,
    channel: row.channel.name.slice(0, 80),
    sessionCached: !sessionFresh,
  });

  let response = await invokeStreamProxyGet(request, sessionId);
  if (response.status === 404 && !sessionFresh) {
    forgetLivePlaybackSession(cacheKey);
    try {
      sessionId = await createStreamSession({
        upstreamRootUrl: upstream.href,
        title: row.channel.name,
        logo: row.channel.tvgLogo?.trim() || undefined,
        group: row.channel.groupTitle?.trim() || undefined,
        proxyConfig: proxyConfig ?? undefined,
      });
      rememberLivePlaybackSession(cacheKey, sessionId);
      response = await invokeStreamProxyGet(request, sessionId);
    } catch {
      return Response.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
    }
  }

  return response;
}
