import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createServerLogger } from "@/core/logging/server";

import { probeStreamUrl } from "@/lib/health/probe-stream";
import { recomputeAggregateForUrl } from "@/lib/health/recompute-aggregate";

const log = createServerLogger("health.runSweep");

const DELAY_MS_BETWEEN_PROBES = 120;

export type SweepResult = {
  probed: number;
  succeeded: number;
  failed: number;
};

export async function runHealthSweep(options?: {
  limit?: number;
  offset?: number;
}): Promise<SweepResult> {
  const limit = options?.limit ?? 400;
  const offset = options?.offset ?? 0;

  const entries = await prisma.channelRegistryEntry.findMany({
    select: { urlHash: true, url: true },
    skip: offset,
    take: limit,
    orderBy: { urlHash: "asc" },
  });

  let succeeded = 0;
  let failed = 0;

  for (const entry of entries) {
    const result = await probeStreamUrl(entry.url);
    await prisma.healthProbe.create({
      data: {
        urlHash: entry.urlHash,
        ok: result.ok,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        error: result.error,
      },
    });
    if (result.ok) succeeded++;
    else failed++;
    await recomputeAggregateForUrl(entry.urlHash);

    if (DELAY_MS_BETWEEN_PROBES > 0) {
      await new Promise((r) => setTimeout(r, DELAY_MS_BETWEEN_PROBES));
    }
  }

  log.info("Health sweep batch complete", {
    probed: entries.length,
    succeeded,
    failed,
    offset,
    limit,
  });

  return { probed: entries.length, succeeded, failed };
}
