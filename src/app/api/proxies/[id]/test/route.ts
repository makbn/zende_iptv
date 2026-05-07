import { NextResponse } from "next/server";

import { getProxy } from "@/lib/proxies/proxy-store";
import { buildProxyAgent } from "@/lib/proxies/proxy-agent";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const row = await getProxy(id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return testProxyConfig({
    id: row.id,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    username: row.username ?? undefined,
    password: row.password ?? undefined,
  });
}

async function testProxyConfig(cfg: {
  id: string;
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
}): Promise<Response> {
  try {
    const agent = buildProxyAgent(cfg);
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
