import { NextResponse } from "next/server";

import { createLoginPairSession } from "@/lib/auth/login-pair-store";

export const runtime = "nodejs";

/** TV: start a short-lived pairing session for mobile QR login. */
export async function POST() {
  const session = createLoginPairSession();
  return NextResponse.json({
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
  });
}
