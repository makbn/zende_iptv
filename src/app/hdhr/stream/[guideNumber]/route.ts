import "server-only";

import { isHdhrEnabled } from "@/lib/hdhr/config";
import { tuneHdhrChannel } from "@/lib/hdhr/tune";

export const runtime = "nodejs";

function hdhrDisabled(): Response {
  return new Response("HDHomeRun emulation disabled.", { status: 404 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ guideNumber: string }> },
): Promise<Response> {
  if (!isHdhrEnabled()) return hdhrDisabled();
  const { guideNumber } = await context.params;
  return tuneHdhrChannel(request, guideNumber);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ guideNumber: string }> },
): Promise<Response> {
  if (!isHdhrEnabled()) return hdhrDisabled();
  const { guideNumber } = await context.params;
  return tuneHdhrChannel(request, guideNumber);
}
