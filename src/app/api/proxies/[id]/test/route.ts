import { NextResponse } from "next/server";
import dns from "node:dns/promises";

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

  if (row.vpnType === "smartdns") {
    let cfg: { dnsServer?: string; dnsServer2?: string } = {};
    try { cfg = JSON.parse(row.vpnConfigJson ?? "{}") as typeof cfg; } catch { /* ok */ }
    if (!cfg.dnsServer) {
      return NextResponse.json({ ok: false, error: "No DNS server configured." });
    }
    return testSmartDns(cfg.dnsServer, cfg.dnsServer2);
  }

  try {
    const agent = buildProxyAgent({
      id: row.id,
      protocol: row.protocol,
      host: row.host,
      port: row.port,
      username: row.username ?? undefined,
      password: row.password ?? undefined,
    });
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

async function testSmartDns(dnsServer: string, dnsServer2?: string): Promise<Response> {
  const TEST_HOST = "netflix.com";
  try {
    const resolver = new dns.Resolver({ timeout: 5_000 });
    resolver.setServers(dnsServer2 ? [dnsServer, dnsServer2] : [dnsServer]);
    const addresses = await resolver.resolve4(TEST_HOST);
    return NextResponse.json({ ok: true, resolvedHost: TEST_HOST, resolvedIp: addresses[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `DNS server unreachable or cannot resolve: ${msg}` });
  }
}
