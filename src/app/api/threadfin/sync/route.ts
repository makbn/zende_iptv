import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { isThreadfinSyncEnabled } from "@/lib/threadfin/config";
import { syncThreadfin } from "@/lib/threadfin/sync";

export const runtime = "nodejs";

/** Force Threadfin playlist/EPG refresh (admin). */
export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (gate.authEnabled && gate.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  if (!isThreadfinSyncEnabled()) {
    return NextResponse.json(
      { error: "Threadfin sync is disabled (ZENDE_THREADFIN_SYNC=0)." },
      { status: 409 },
    );
  }

  const result = await syncThreadfin({ skipWait: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
