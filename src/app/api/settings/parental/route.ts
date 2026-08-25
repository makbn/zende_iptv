import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { invalidateXtreamCatalogCache } from "@/lib/iptv/aggregated-channels";
import {
  clearParentalUnlockCookie,
  issueParentalUnlockCookie,
  isParentalPolicyActive,
  resolveParentalAccess,
  saveParentalPolicy,
  verifyParentalPin,
} from "@/lib/parental/parental-control-store";
import { isThreadfinSyncEnabled } from "@/lib/threadfin/config";
import { syncThreadfin } from "@/lib/threadfin/sync";

export const runtime = "nodejs";

const patchSchema = z.object({
  enabled: z.boolean(),
  hiddenPatterns: z.array(z.string().trim().min(1).max(120)).max(64),
  pin: z.union([z.string().trim().regex(/^\d{4,12}$/), z.null()]).optional(),
});

const unlockSchema = z.object({
  pin: z.string().max(64).optional().default(""),
});

function canManage(
  gate:
    | { authEnabled: false }
    | { authEnabled: true; user: { role: "ADMIN" | "USER" } },
): boolean {
  return !gate.authEnabled || gate.user.role === "ADMIN";
}

export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const access = await resolveParentalAccess(request, gate);
  return NextResponse.json(
    {
      ...access.policy,
      unlocked: access.unlocked,
      locked: isParentalPolicyActive(access.policy) && !access.unlocked,
      canManage: canManage(gate),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Cookie, Authorization",
      },
    },
  );
}

export async function PATCH(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (!canManage(gate)) {
    return NextResponse.json(
      { error: "Administrator access is required to change parental controls." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const policy = await saveParentalPolicy(parsed.data);
  invalidateXtreamCatalogCache({ scheduleThreadfin: false });

  let plexSyncOk: boolean | null = null;
  let plexSyncError: string | null = null;
  if (isThreadfinSyncEnabled()) {
    try {
      const result = await syncThreadfin({ skipWait: true });
      plexSyncOk = result.ok;
      plexSyncError = result.error ?? null;
    } catch (error) {
      plexSyncOk = false;
      plexSyncError = error instanceof Error ? error.message : "Threadfin refresh failed";
    }
  }

  const response = NextResponse.json({
    ok: true,
    ...policy,
    unlocked: !isParentalPolicyActive(policy),
    locked: isParentalPolicyActive(policy),
    canManage: true,
    plexSyncOk,
    plexSyncError,
  });
  clearParentalUnlockCookie(response);
  return response;
}

/** Unlock restricted channels for this signed-in browser session. */
export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    /* an empty body is valid when no PIN is configured */
  }
  const parsed = unlockSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const access = await resolveParentalAccess(request, gate);
  if (!isParentalPolicyActive(access.policy)) {
    return NextResponse.json({ ok: true, unlocked: true, locked: false });
  }
  if (!(await verifyParentalPin(parsed.data.pin))) {
    return NextResponse.json({ error: "Incorrect parental PIN." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, unlocked: true, locked: false });
  await issueParentalUnlockCookie(response, {
    subject: access.subject,
    policyVersion: access.policy.version,
  });
  return response;
}

/** Re-lock restricted channels immediately in this browser session. */
export async function DELETE(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const response = NextResponse.json({ ok: true, unlocked: false, locked: true });
  clearParentalUnlockCookie(response);
  return response;
}
