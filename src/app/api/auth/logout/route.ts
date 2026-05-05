import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
} from "@/lib/auth/refresh-token-db";

export const runtime = "nodejs";

const bodySchema = z.object({
  refreshToken: z.string().optional(),
});

/**
 * With `Authorization: Bearer <access>` → revoke all refresh tokens for that user.
 * With `{ refreshToken }` only → revoke that refresh session.
 */
export async function POST(request: Request) {
  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    /* empty ok */
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const gate = await gateApiRequest(request);
  if (!("response" in gate) && gate.authEnabled && "user" in gate) {
    await revokeAllRefreshTokensForUser(gate.user.id);
  } else if (parsed.data.refreshToken) {
    await revokeRefreshToken(parsed.data.refreshToken);
  }

  return NextResponse.json({ ok: true });
}
