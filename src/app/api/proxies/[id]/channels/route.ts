import { NextResponse } from "next/server";
import { z } from "zod";

import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import {
  assignChannelsToProxy,
  getProxy,
  listProxyChannels,
} from "@/lib/proxies/proxy-store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  if (!(await getProxy(id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const skip = parseInt(url.searchParams.get("skip") ?? "0", 10);
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "50", 10), 200);

  try {
    const { rows, total } = await listProxyChannels(id, { q, skip, take });
    return NextResponse.json({ rows, total });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}

const assignSchema = z.object({
  urlHashes: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  if (!(await getProxy(id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = assignSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await assignChannelsToProxy(id, parsed.data.urlHashes);
    return NextResponse.json({ assigned: parsed.data.urlHashes.length });
  } catch {
    return NextResponse.json({ error: PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
