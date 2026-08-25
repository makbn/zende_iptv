import "server-only";

import { isHdhrEnabled } from "@/lib/hdhr/config";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import {
  buildXmltvDocument,
  collectXmltvChannels,
} from "@/lib/iptv/xmltv-guide";

export const runtime = "nodejs";

function hdhrDisabled(): Response {
  return new Response("HDHomeRun emulation disabled.", { status: 404 });
}

export async function GET(request: Request): Promise<Response> {
  if (!isHdhrEnabled()) return hdhrDisabled();

  const { streams } = await getAggregatedXtreamCatalog();
  const channels = collectXmltvChannels(streams, (row) => String(row.streamId));
  const body = buildXmltvDocument(channels, getRequestOrigin(request));

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml;charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
