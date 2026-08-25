import { randomBytes } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { forbidCustomerSystemMutation, gateApiRequest } from "@/lib/auth/gate-api";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { THREADFIN_PORTAL_USERNAME } from "@/lib/threadfin/config";

export const runtime = "nodejs";

const createSchema = z.object({
  label: z.string().max(160).optional(),
  portalUsername: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{3,48}$/)
    .optional(),
});

function randomPortalUsername(): string {
  return `zc_${randomBytes(5).toString("hex")}`;
}

async function portalSecret(): Promise<string> {
  return randomBytes(18).toString("base64url");
}

type ListFilter =
  | { listAll: true }
  | { listAll: false; where: { ownerUserId: string | null } };

async function listFilter(
  gate: Awaited<ReturnType<typeof gateApiRequest>>,
): Promise<{ ok: false; response: Response } | { ok: true; filter: ListFilter }> {
  if ("response" in gate) return { ok: false, response: gate.response };

  if (!gate.authEnabled) {
    return { ok: true, filter: { listAll: false, where: { ownerUserId: null } } };
  }

  if (gate.user.role === "ADMIN") {
    return { ok: true, filter: { listAll: true } };
  }

  return {
    ok: true,
    filter: { listAll: false, where: { ownerUserId: gate.user.id } },
  };
}

/** Manage Xtream-compatible portal identities (stored secret is hashed; plaintext is revealed only once on create). */
export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;
  const flt = await listFilter(gate);
  if (!flt.ok) return flt.response;

  const credentials = flt.filter.listAll
    ? (
        await prisma.iptvClientCredential.findMany({
          orderBy: { createdAt: "desc" },
          include: { owner: { select: { username: true } } },
        })
      )
        .filter((r) => r.portalUsername !== THREADFIN_PORTAL_USERNAME)
        .map((r) => ({
          id: r.id,
          label: r.label,
          portalUsername: r.portalUsername,
          createdAt: r.createdAt.toISOString(),
          lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
          ownerUserId: r.ownerUserId,
          ownerUsername: r.owner?.username ?? null,
        }))
    : (
        await prisma.iptvClientCredential.findMany({
          where: flt.filter.where,
          orderBy: { createdAt: "desc" },
        })
      )
        .filter((r) => r.portalUsername !== THREADFIN_PORTAL_USERNAME)
        .map((r) => ({
          id: r.id,
          label: r.label,
          portalUsername: r.portalUsername,
          createdAt: r.createdAt.toISOString(),
          lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
          ownerUserId: r.ownerUserId,
        }));

  return NextResponse.json({ credentials });
}

export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  const forbidden = forbidCustomerSystemMutation(gate);
  if (forbidden) return forbidden;

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

  const label = (parsed.data.label ?? "").trim();
  let portalUsername = parsed.data.portalUsername?.trim();
  if (!portalUsername) {
    for (let i = 0; i < 8; i++) {
      const candidate = randomPortalUsername();
      const taken = await prisma.iptvClientCredential.findUnique({
        where: { portalUsername: candidate },
        select: { id: true },
      });
      if (!taken) {
        portalUsername = candidate;
        break;
      }
    }
    if (!portalUsername) {
      return NextResponse.json(
        { error: "Could not allocate portal username." },
        { status: 500 },
      );
    }
  }

  const portalPasswordPlain = await portalSecret();
  const passwordHash = await hashPassword(portalPasswordPlain);
  const ownerUserId = gate.authEnabled ? gate.user.id : null;

  try {
    const credential = await prisma.iptvClientCredential.create({
      data: {
        label,
        portalUsername,
        passwordHash,
        ownerUserId,
      },
      select: {
        id: true,
        label: true,
        portalUsername: true,
        createdAt: true,
      },
    });
    return NextResponse.json({
      credential: {
        ...credential,
        createdAt: credential.createdAt.toISOString(),
      },
      portalPassword: portalPasswordPlain,
    });
  } catch {
    return NextResponse.json(
      { error: "Portal username already taken." },
      { status: 409 },
    );
  }
}
