"use client";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { createClientLogger } from "@/core/logging/client";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { Z_ACCESS } from "@/lib/auth/token-storage-keys";

const log = createClientLogger("health.registrySync");

const BATCH = 2500;

function registryHeaders(): HeadersInit {
  const h: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (typeof window === "undefined") return h;
  if (typeof localStorage !== "undefined" && localStorage.getItem(Z_ACCESS)) {
    return h;
  }
  const secret = sessionStorage.getItem("zende.cronSecret");
  if (secret) h.Authorization = `Bearer ${secret}`;
  return h;
}

/** Upserts stream URLs on the server so nightly / manual probes have a registry. */
export async function syncChannelRegistry(
  channels: M3uChannel[],
  presetId?: string,
): Promise<void> {
  if (channels.length === 0) return;

  for (let i = 0; i < channels.length; i += BATCH) {
    const segment = channels.slice(i, i + BATCH);
    const seenUrl = new Set<string>();
    const slice = [];
    for (const c of segment) {
      const u = c.url.trim();
      if (seenUrl.has(u)) continue;
      seenUrl.add(u);
      slice.push({
        url: c.url,
        label: c.name?.slice(0, 512),
        presetId,
      });
    }
    if (slice.length === 0) continue;

    const res = await zendeFetch("/api/channel-registry/sync", {
      method: "POST",
      headers: registryHeaders(),
      body: JSON.stringify({ entries: slice }),
    });

    if (!res.ok) {
      log.warn("Registry sync failed", {
        status: res.status,
        body: await res.text().catch(() => ""),
      });
    }
  }
}
