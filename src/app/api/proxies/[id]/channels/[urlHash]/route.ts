import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import { removeChannelFromProxy } from "@/lib/proxies/proxy-store";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; urlHash: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const { urlHash } = await context.params;
  try {
    await removeChannelFromProxy(urlHash);
    return new Response(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
