import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { getThreadfinCatalog } from "@/lib/threadfin/catalog";
import { buildThreadfinXmltv } from "@/lib/threadfin/xmltv";

export const runtime = "nodejs";

/** XMLTV guide for the favorites-only Threadfin lineup. */
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

  const { rows } = await getThreadfinCatalog();
  const guide = await buildThreadfinXmltv(rows, getRequestOrigin(request));
  return new Response(guide.xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml;charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Zende-Guide-Channels": String(guide.channels),
      "X-Zende-Guide-Programmes": String(guide.programmes),
      "X-Zende-Guide-Provider-Matched": String(guide.providerMatched),
    },
  });
}
