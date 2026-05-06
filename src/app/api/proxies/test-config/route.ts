import { NextResponse } from "next/server";
import { z } from "zod";

import { buildProxyAgent } from "@/lib/proxies/proxy-agent";

export const runtime = "nodejs";

const schema = z.object({
  protocol: z.enum(["http", "https", "socks5"]),
  host: z.string().min(1).max(512),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(256).optional(),
  password: z.string().max(512).optional(),
});

/** Test an unsaved proxy config (no auth required — just hits checkip). */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const agent = buildProxyAgent({ id: "test", ...parsed.data });
    const res = await fetch("https://checkip.amazonaws.com/", {
      signal: AbortSignal.timeout(10_000),
      dispatcher: agent,
    } as RequestInit);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `HTTP ${res.status}` });
    }
    const ip = (await res.text()).trim();
    return NextResponse.json({ ok: true, ip });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg });
  }
}
