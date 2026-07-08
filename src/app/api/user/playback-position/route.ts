import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(4).max(8192),
  positionSeconds: z.number().finite().min(0).max(86400 * 12),
});

/** Resume position sync stub — accepts writes; persistence can be added later. */
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

  return NextResponse.json({ ok: true, stored: false });
}
