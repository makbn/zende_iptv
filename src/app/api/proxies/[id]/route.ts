import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import {
  countProxyChannels,
  deleteProxy,
  getProxy,
  updateProxy,
} from "@/lib/proxies/proxy-store";
import { stopGluetunContainer } from "@/lib/proxies/gluetun-manager";

export const runtime = "nodejs";

const updateDirectSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  protocol: z.enum(["http", "https", "socks5"]).optional(),
  host: z.string().min(1).max(512).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().max(256).nullable().optional(),
  password: z.string().max(512).nullable().optional(),
});

const updateGluetunSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  vpnProvider: z.enum(["nordvpn", "expressvpn", "protonvpn", "custom_openvpn", "custom_wireguard"]).optional(),
  vpnConfigJson: z.string().min(2).optional(),
});

const updateSmartDnsSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  dnsServer: z.string().min(7).max(45).optional(),
  dnsServer2: z.string().min(7).max(45).nullable().optional(),
});

function rowToResponse(r: NonNullable<Awaited<ReturnType<typeof getProxy>>>, channelCount: number) {
  return {
    id: r.id,
    name: r.name,
    vpnType: r.vpnType,
    protocol: r.protocol,
    host: r.host,
    port: r.port,
    username: r.username,
    vpnProvider: r.vpnProvider,
    vpnConfigJson: r.vpnConfigJson,
    gluetunStatus: r.gluetunStatus,
    gluetunHostPort: r.gluetunHostPort,
    createdByUserId: r.createdByUserId,
    channelCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Returns true when the requester may mutate this proxy. */
function canMutate(
  gate: Awaited<ReturnType<typeof gateApiRequest>>,
  proxyCreatedByUserId: string | null,
): boolean {
  // Auth disabled — everyone can mutate.
  if (!gate.authEnabled) return true;
  if (!("user" in gate)) return false;
  return gate.user.role === "ADMIN" || gate.user.id === proxyCreatedByUserId;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const { id } = await context.params;
  const row = await getProxy(id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(rowToResponse(row, await countProxyChannels(id)));
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const { id } = await context.params;
  const existing = await getProxy(id);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!canMutate(gate, existing.createdByUserId)) {
    return NextResponse.json({ error: "Forbidden. You can only edit proxies you created." }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const schema =
    existing.vpnType === "gluetun"
      ? updateGluetunSchema
      : existing.vpnType === "smartdns"
        ? updateSmartDnsSchema
        : updateDirectSchema;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    let updateData: Parameters<typeof updateProxy>[1] = parsed.data;
    // Merge updated DNS IPs back into vpnConfigJson for Smart DNS proxies.
    if (existing.vpnType === "smartdns") {
      const d = parsed.data as { name?: string; dnsServer?: string; dnsServer2?: string | null };
      let current: { dnsServer?: string; dnsServer2?: string } = {};
      try { current = JSON.parse(existing.vpnConfigJson ?? "{}") as typeof current; } catch { /* ok */ }
      const merged = {
        dnsServer: d.dnsServer ?? current.dnsServer ?? "",
        ...(d.dnsServer2 !== undefined
          ? (d.dnsServer2 ? { dnsServer2: d.dnsServer2 } : {})
          : (current.dnsServer2 ? { dnsServer2: current.dnsServer2 } : {})),
      };
      updateData = { name: d.name, vpnConfigJson: JSON.stringify(merged) };
    }
    const row = await updateProxy(id, updateData);
    return NextResponse.json(rowToResponse(row, await countProxyChannels(id)));
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const { id } = await context.params;
  const existing = await getProxy(id);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!canMutate(gate, existing.createdByUserId)) {
    return NextResponse.json({ error: "Forbidden. You can only delete proxies you created." }, { status: 403 });
  }

  try {
    if (existing.vpnType === "gluetun" && existing.gluetunContainerId) {
      await stopGluetunContainer(existing.gluetunContainerId).catch(() => null);
    }
    await deleteProxy(id);
    return new Response(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
