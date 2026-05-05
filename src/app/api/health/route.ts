import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const log = createServerLogger("api.health");
  const requestId = request.headers.get("x-request-id") ?? undefined;

  log.debug("Health check requested", { requestId });

  /** Minimal payload — do not echo request IDs or internals (usable behind shared proxies). */
  return NextResponse.json({ ok: true, service: "zenede" }, { status: 200 });
}
