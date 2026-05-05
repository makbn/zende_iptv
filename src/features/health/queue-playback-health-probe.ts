"use client";

import { createClientLogger } from "@/core/logging/client";
import { zendeFetch } from "@/lib/auth/zende-fetch";

const log = createClientLogger("health.queuePlaybackProbe");

/**
 * Non-blocking POST so opening Watch stays instant; updates SQLite health aggregates server-side.
 */
export function queuePlaybackHealthProbe(input: {
  url: string;
  label?: string;
  presetId?: string;
}): void {
  const url = input.url?.trim();
  if (!url) return;

  void zendeFetch("/api/channel-health/probe-from-watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      label: input.label,
      presetId: input.presetId,
    }),
    keepalive: true,
  })
    .then(async (res) => {
      if (!res.ok) {
        log.debug("Playback health probe HTTP error", { status: res.status });
      }
    })
    .catch(() => {
      /* ignore network errors */
    });
}
