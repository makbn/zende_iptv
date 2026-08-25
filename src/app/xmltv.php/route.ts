import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import {
  buildXmltvDocument,
  collectXmltvChannels,
  createXmltvImageProxyTransform,
} from "@/lib/iptv/xmltv-guide";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { fetchXtreamXmltv } from "@/lib/iptv/xtream-client";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";

export const runtime = "nodejs";

/**
 * Relays the imported Xtream provider's real XMLTV without exposing its
 * credentials. Falls back to a placeholder grid when no provider is saved.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const username = url.searchParams.get("username")?.trim() ?? "";
  const password = url.searchParams.get("password")?.trim() ?? "";

  const cred = await verifyIptvPortalLogin(username, password);
  if (!cred) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });
  }

  void cred;
  const origin = getRequestOrigin(request);

  const providerCredentials = await loadXtreamPortalCredentials();
  if (providerCredentials) {
    const upstream = await fetchXtreamXmltv(providerCredentials);
    if (upstream?.body) {
      return new Response(upstream.body.pipeThrough(createXmltvImageProxyTransform(origin)), {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "application/xml;charset=utf-8",
          "Cache-Control": "private, max-age=300",
          "X-Accel-Buffering": "no",
          "X-Zende-Epg-Source": "xtream-provider",
        },
      });
    }
  }

  const { streams } = await getAggregatedXtreamCatalog();
  const channels = collectXmltvChannels(
    streams,
    (row) => row.channel.tvgId?.trim() || String(row.streamId),
  );
  const body = buildXmltvDocument(channels, origin);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml;charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
