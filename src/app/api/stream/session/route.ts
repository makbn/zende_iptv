import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import { hashStreamUrl } from "@/lib/health/url-hash";
import { getProxyForChannel, ProxyNotReadyError } from "@/lib/proxies/proxy-store";
import { createStreamSession } from "@/lib/stream/stream-session-store";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(4).max(8192),
  title: z.string().max(512).optional(),
  logo: z.string().max(8192).optional(),
  group: z.string().max(512).optional(),
  /**
   * Seed cookie jar for the stream's origin — e.g. authenticated session
   * cookies extracted from a browser DevTools session. Name → value.
   */
  cookies: z.record(z.string(), z.string()).optional(),
});

/**
 * Registers an upstream HLS / stream URL and returns an opaque id used by `/watch?id=…`
 * and `/api/stream/proxy/[id]`. Requires auth when enabled (same as other APIs).
 */
export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let upstream: URL;
  try {
    upstream = new URL(parsed.data.url);
  } catch {
    return NextResponse.json({ error: "Invalid stream URL." }, { status: 400 });
  }
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) streams are supported." }, { status: 400 });
  }

  // Look up any VPN proxy assignment for this channel URL.
  const urlHash = await hashStreamUrl(upstream.href);
  let proxyConfig;
  try {
    proxyConfig = await getProxyForChannel(urlHash);
  } catch (err) {
    if (err instanceof ProxyNotReadyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }

  try {
    const id = await createStreamSession({
      upstreamRootUrl: upstream.href,
      title: (parsed.data.title ?? "").trim() || "Live",
      logo: parsed.data.logo?.trim() || undefined,
      group: parsed.data.group?.trim() || undefined,
      cookies: parsed.data.cookies,
      proxyConfig: proxyConfig ?? undefined,
    });
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
