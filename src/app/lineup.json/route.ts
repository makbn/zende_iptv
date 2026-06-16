import "server-only";

import { isHdhrEnabled } from "@/lib/hdhr/config";
import { buildHdhrLineup } from "@/lib/hdhr/lineup";

export const runtime = "nodejs";

function hdhrDisabled(): Response {
  return new Response("HDHomeRun emulation disabled.", { status: 404 });
}

export async function GET(request: Request): Promise<Response> {
  if (!isHdhrEnabled()) return hdhrDisabled();

  const lineup = await buildHdhrLineup(request);
  const body = JSON.stringify(lineup, null, 2);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}

export async function HEAD(request: Request): Promise<Response> {
  const res = await GET(request);
  return new Response(null, { status: res.status, headers: res.headers });
}
