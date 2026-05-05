import "server-only";

import { runHealthSweep } from "@/lib/health/run-sweep";

const BATCH = 200;

export async function runHealthSweepAll() {
  let probed = 0;
  let succeeded = 0;
  let failed = 0;
  let offset = 0;

  while (true) {
    const batch = await runHealthSweep({ limit: BATCH, offset });
    probed += batch.probed;
    succeeded += batch.succeeded;
    failed += batch.failed;
    if (batch.probed === 0 || batch.probed < BATCH) break;
    offset += BATCH;
  }

  return { probed, succeeded, failed };
}
