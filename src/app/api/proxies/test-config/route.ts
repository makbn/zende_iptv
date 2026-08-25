import { NextResponse } from "next/server";
import { z } from "zod";
import dns from "node:dns/promises";

import { buildProxyAgent } from "@/lib/proxies/proxy-agent";
import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";

export const runtime = "nodejs";

const directSchema = z.object({
  vpnType: z.literal("direct").optional(),
  protocol: z.enum(["http", "https", "socks5"]),
  host: z.string().min(1).max(512),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(256).optional(),
  password: z.string().max(512).optional(),
});

const smartDnsSchema = z.object({
  vpnType: z.literal("smartdns"),
  dnsServer: z.string().min(7).max(45),
  dnsServer2: z.string().min(7).max(45).optional(),
});

const schema = z.union([directSchema, smartDnsSchema]);

/** Test an unsaved proxy or Smart DNS config (administrator-only when auth is enabled). */
export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;

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

  if (parsed.data.vpnType === "smartdns") {
    return testSmartDns(parsed.data.dnsServer, parsed.data.dnsServer2);
  }

  try {
    const d = parsed.data as { protocol: string; host: string; port: number; username?: string; password?: string };
    const agent = buildProxyAgent({ id: "test", protocol: d.protocol, host: d.host, port: d.port, username: d.username, password: d.password });
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
