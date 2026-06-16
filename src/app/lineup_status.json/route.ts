import "server-only";

import { isHdhrEnabled } from "@/lib/hdhr/config";
import { buildHdhrLineupStatus } from "@/lib/hdhr/lineup";

export const runtime = "nodejs";

function hdhrDisabled(): Response {
  return new Response("HDHomeRun emulation disabled.", { status: 404 });
}

export async function GET(): Promise<Response> {
  if (!isHdhrEnabled()) return hdhrDisabled();

  const body = JSON.stringify(buildHdhrLineupStatus(), null, 2);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function HEAD(): Promise<Response> {
  const res = await GET();
  return new Response(null, { status: res.status, headers: res.headers });
}
