import "server-only";

import {
  getHdhrFriendlyName,
  isHdhrEnabled,
} from "@/lib/hdhr/config";
import { buildHdhrCapabilityXml } from "@/lib/hdhr/lineup";

export const runtime = "nodejs";

function hdhrDisabled(): Response {
  return new Response("HDHomeRun emulation disabled.", { status: 404 });
}

async function capabilityResponse(request: Request): Promise<Response> {
  if (!isHdhrEnabled()) return hdhrDisabled();

  const body = buildHdhrCapabilityXml(request, getHdhrFriendlyName());

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  return capabilityResponse(request);
}

export async function HEAD(request: Request): Promise<Response> {
  const res = await capabilityResponse(request);
  return new Response(null, { status: res.status, headers: res.headers });
}
