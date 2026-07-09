"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { playbackMetaForChannel } from "@/lib/navigation/playback-meta-for-channel";
import { createWatchUrl, type CreateWatchInput } from "@/lib/navigation/watch-url";
import { showPageHrefFromChannel } from "@/lib/navigation/show-page";
import { useRemoteControl } from "@/features/remote/remote-control-context";

export function useWatchNavigation() {
  const router = useRouter();
  const remote = useRemoteControl();
  const [navError, setNavError] = useState<string | null>(null);

  const openChannel = useCallback(
    (ch: Pick<M3uChannel, "url" | "name"> & Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle" | "tvgId" | "contentType">> & { playback?: CreateWatchInput["playback"] }) => {
      if (resolveLibraryContentType(ch as M3uChannel) === "series") {
        const href = showPageHrefFromChannel(ch as M3uChannel);
        if (href) {
          if (remote?.activeSession) {
            void remote.sendNavigate(href).catch(() => {
              setNavError("Could not send this to the TV.");
            });
            return;
          }
          router.push(href);
          return;
        }
      }
      void (async () => {
        try {
          const playback = playbackMetaForChannel(ch);
          const href = await createWatchUrl({
            ...ch,
            ...(playback ? { playback } : {}),
          });
          if (remote?.activeSession) {
            const sent = await remote.sendNavigate(href);
            if (!sent) throw new Error("Could not send this to the TV.");
            return;
          }
          router.push(href);
        } catch (err) {
          setNavError(err instanceof Error ? err.message : "Could not start playback.");
        }
      })();
    },
    [remote, router],
  );

  const clearNavError = useCallback(() => setNavError(null), []);

  return { openChannel, navError, clearNavError };
}
