import { NextResponse } from "next/server";

import { loginPairOrigin } from "@/lib/auth/login-pair-origin";
import { createLoginPairSession } from "@/lib/auth/login-pair-store";

export const runtime = "nodejs";

/** TV: start a short-lived pairing session for mobile QR login. */
export async function POST(request: Request) {
  const session = createLoginPairSession();
  const verificationUrl = new URL("/login/pair", loginPairOrigin(request));
  verificationUrl.searchParams.set("s", session.sessionId);

  return NextResponse.json({
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    verificationUri: verificationUrl.href,
  });
}
