import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import { searchUnassignedChannels } from "@/lib/proxies/proxy-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const excludeProxy = url.searchParams.get("excludeProxy") ?? undefined;
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "30", 10), 100);

  if (!q.trim() && !excludeProxy) {
    return NextResponse.json([]);
  }

  try {
    const rows = await searchUnassignedChannels({ q: q.trim(), excludeProxyId: excludeProxy, take });
    return NextResponse.json(
      rows.map((r) => ({ urlHash: r.urlHash, url: r.url, label: r.label })),
    );
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
