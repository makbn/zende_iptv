import { NextResponse } from "next/server";

import { createLoginPairSession } from "@/lib/auth/login-pair-store";

export const runtime = "nodejs";

/** TV: start a short-lived pairing session for mobile QR login. */
export async function POST(request: Request) {
  const session = createLoginPairSession();
  const requestUrl = new URL(request.url);
  const configuredOrigin = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = request.headers.get("host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHost;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto === "https" || forwardedProto === "http"
    ? forwardedProto
    : requestUrl.protocol.replace(":", "");
  const origin = configuredOrigin || (host ? `${proto}://${host}` : requestUrl.origin);
  const verificationUrl = new URL("/login/pair", origin);
  verificationUrl.searchParams.set("s", session.sessionId);

  return NextResponse.json({
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    verificationUri: verificationUrl.href,
  });
}
