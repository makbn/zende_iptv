"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { createWatchUrl } from "@/lib/navigation/watch-url";

export function useWatchNavigation() {
  const router = useRouter();
  const [navError, setNavError] = useState<string | null>(null);

  const openChannel = useCallback(
    (ch: Pick<M3uChannel, "url" | "name"> & Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle">>) => {
      void (async () => {
        try {
          const href = await createWatchUrl(ch);
          router.push(href);
        } catch (err) {
          setNavError(err instanceof Error ? err.message : "Could not start playback.");
        }
      })();
    },
    [router],
  );

  const clearNavError = useCallback(() => setNavError(null), []);

  return { openChannel, navError, clearNavError };
}
