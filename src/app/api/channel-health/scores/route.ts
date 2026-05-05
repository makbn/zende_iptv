import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { gateApiRequest } from "@/lib/auth/gate-api";

export const runtime = "nodejs";

/** Public read model when auth is off; requires session when auth is on. */
export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const rows = await prisma.healthAggregate.findMany({
    select: {
      urlHash: true,
      tier: true,
      successRate: true,
      sampleCount: true,
      updatedAt: true,
    },
  });

  const scores: Record<
    string,
    {
      tier: string;
      successRate: number;
      sampleCount: number;
      updatedAt: string;
    }
  > = {};

  for (const r of rows) {
    scores[r.urlHash] = {
      tier: r.tier,
      successRate: r.successRate,
      sampleCount: r.sampleCount,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  return NextResponse.json({ scores });
}
