import "server-only";

import { prisma } from "@/lib/db/prisma";

import {
  HEALTH_WINDOW_DAYS,
  tierFromStats,
  type HealthTier,
} from "@/lib/health/tier";

export async function recomputeAggregateForUrl(urlHash: string): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - HEALTH_WINDOW_DAYS);

  const rows = await prisma.healthProbe.findMany({
    where: { urlHash, checkedAt: { gte: since } },
    select: { ok: true },
    orderBy: { checkedAt: "desc" },
  });

  const sampleCount = rows.length;
  const successes = rows.filter((r) => r.ok).length;
  const successRate = sampleCount === 0 ? 0 : successes / sampleCount;
  const recentNewestFirst = rows.map((r) => r.ok);
  const tier: HealthTier = tierFromStats(
    successRate,
    sampleCount,
    recentNewestFirst,
  );

  await prisma.healthAggregate.upsert({
    where: { urlHash },
    create: {
      urlHash,
      tier,
      successRate,
      sampleCount,
      windowDays: HEALTH_WINDOW_DAYS,
    },
    update: {
      tier,
      successRate,
      sampleCount,
      windowDays: HEALTH_WINDOW_DAYS,
    },
  });
}

export async function recomputeAllAggregates(): Promise<number> {
  const hashes = await prisma.healthProbe.groupBy({
    by: ["urlHash"],
    _count: true,
  });

  for (const row of hashes) {
    await recomputeAggregateForUrl(row.urlHash);
  }

  return hashes.length;
}
