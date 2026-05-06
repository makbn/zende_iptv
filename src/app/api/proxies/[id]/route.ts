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
    channelCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const schema = existing.vpnType === "gluetun" ? updateGluetunSchema : updateDirectSchema;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const row = await updateProxy(id, parsed.data);
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

  try {
    // Stop Gluetun container before deleting the DB row
    if (existing.vpnType === "gluetun" && existing.gluetunContainerId) {
      await stopGluetunContainer(existing.gluetunContainerId).catch(() => null);
    }
    await deleteProxy(id);
    return new Response(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
