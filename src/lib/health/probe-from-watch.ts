import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { prisma } from "@/lib/db/prisma";
import { probeStreamUrl } from "@/lib/health/probe-stream";
import { recomputeAggregateForUrl } from "@/lib/health/recompute-aggregate";
import { hashStreamUrl } from "@/lib/health/url-hash";

const log = createServerLogger("health.probeFromWatch");

function normalizeWatchUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Registers the stream (if needed), runs an HTTP reachability probe, stores a
 * {@link HealthProbe} row, and recomputes aggregates — same pipeline as nightly sweeps.
 * Intended when the user opens Watch so reliability badges stay fresh without blocking UI.
 */
export async function recordPlaybackHealthProbe(input: {
  url: string;
  label?: string;
  presetId?: string;
}): Promise<{ probeOk: boolean; urlHash: string }> {
  const normalized = normalizeWatchUrl(input.url);
  if (!normalized) {
    throw new Error("Invalid stream URL");
  }

  const urlHash = await hashStreamUrl(normalized);

  await prisma.channelRegistryEntry.upsert({
    where: { urlHash },
    create: {
      urlHash,
      url: normalized,
      label: input.label?.slice(0, 512),
      presetId: input.presetId,
    },
    update: {
      url: normalized,
      ...(input.label != null ? { label: input.label.slice(0, 512) } : {}),
      ...(input.presetId != null ? { presetId: input.presetId } : {}),
    },
  });

  const result = await probeStreamUrl(normalized);
  await prisma.healthProbe.create({
    data: {
      urlHash,
      ok: result.ok,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
      error: result.error,
    },
  });
  await recomputeAggregateForUrl(urlHash);

  log.debug("Playback probe recorded", {
    urlHash,
    probeOk: result.ok,
    latencyMs: result.latencyMs,
  });

  return { probeOk: result.ok, urlHash };
}
