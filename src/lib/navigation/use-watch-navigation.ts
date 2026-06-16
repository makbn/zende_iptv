"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { contentTypeFromStreamUrl } from "@/lib/channels/content-type";
import { createWatchUrl, type CreateWatchInput } from "@/lib/navigation/watch-url";

export function useWatchNavigation() {
  const router = useRouter();
  const [navError, setNavError] = useState<string | null>(null);

  const openChannel = useCallback(
    (ch: Pick<M3uChannel, "url" | "name"> & Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle">> & { playback?: CreateWatchInput["playback"] }) => {
      void (async () => {
        try {
          const kind = contentTypeFromStreamUrl(ch.url);
          const href = await createWatchUrl({
            ...ch,
            playback: ch.playback ?? (kind === "movie" ? { contentKind: "movie" } : undefined),
          });
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
