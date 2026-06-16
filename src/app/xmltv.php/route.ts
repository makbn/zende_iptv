import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import {
  buildXmltvDocument,
  collectXmltvChannels,
} from "@/lib/iptv/xmltv-guide";

export const runtime = "nodejs";

/**
 * XMLTV with placeholder programmes — many IPTV apps hide the guide entirely when no `<programme>`
 * rows exist; channels-only feeds look “empty”.
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

  const { streams } = await getAggregatedXtreamCatalog();
  const channels = collectXmltvChannels(
    streams,
    (row) => row.channel.tvgId?.trim() || String(row.streamId),
  );
  const body = buildXmltvDocument(channels);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml;charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
