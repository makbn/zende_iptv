import "server-only";

import {
  getHdhrFriendlyName,
  isHdhrEnabled,
} from "@/lib/hdhr/config";
import { buildHdhrDiscover } from "@/lib/hdhr/lineup";

export const runtime = "nodejs";

function hdhrDisabled(): Response {
  return new Response("HDHomeRun emulation disabled.", { status: 404 });
}

export async function GET(request: Request): Promise<Response> {
  if (!isHdhrEnabled()) return hdhrDisabled();

  const body = JSON.stringify(
    buildHdhrDiscover(request, getHdhrFriendlyName()),
    null,
    2,
  );

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}

export async function HEAD(request: Request): Promise<Response> {
  const res = await GET(request);
  return new Response(null, { status: res.status, headers: res.headers });
}
