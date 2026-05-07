import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import {
  countProxyChannels,
  createProxy,
  listProxies,
} from "@/lib/proxies/proxy-store";

export const runtime = "nodejs";

const directSchema = z.object({
  name: z.string().min(1).max(128),
  vpnType: z.literal("direct"),
  protocol: z.enum(["http", "https", "socks5"]),
  host: z.string().min(1).max(512),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(256).optional(),
  password: z.string().max(512).optional(),
});

const gluetunSchema = z.object({
  name: z.string().min(1).max(128),
  vpnType: z.literal("gluetun"),
  vpnProvider: z.enum(["nordvpn", "expressvpn", "protonvpn", "custom_openvpn", "custom_wireguard"]),
  vpnConfigJson: z.string().min(2),
});

const createSchema = z.union([directSchema, gluetunSchema]);

function rowToResponse(r: Awaited<ReturnType<typeof createProxy>>, channelCount: number) {
  return {
    id: r.id,
    name: r.name,
    vpnType: r.vpnType,
    protocol: r.protocol,
    host: r.host,
    port: r.port,
    username: r.username,
    vpnProvider: r.vpnProvider,
    gluetunStatus: r.gluetunStatus,
    gluetunHostPort: r.gluetunHostPort,
    createdByUserId: r.createdByUserId,
    channelCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  try {
    const rows = await listProxies();
    const counts = await Promise.all(rows.map((r) => countProxyChannels(r.id)));
    return NextResponse.json(rows.map((r, i) => rowToResponse(r, counts[i])));
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const createdByUserId = "user" in gate ? gate.user.id : null;
    const row = await createProxy({ ...parsed.data, createdByUserId });
    return NextResponse.json(rowToResponse(row, 0), { status: 201 });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
