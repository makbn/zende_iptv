"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { playbackMetaForChannel } from "@/lib/navigation/playback-meta-for-channel";
import {
  beginPlaybackNavigation,
  endPlaybackNavigation,
} from "@/lib/navigation/playback-navigation-feedback";
import { createWatchUrl, type CreateWatchInput } from "@/lib/navigation/watch-url";
import { showPageHrefFromChannel } from "@/lib/navigation/show-page";
import { moviePageHrefFromChannel } from "@/lib/navigation/movie-page";
import { useRemoteControl } from "@/features/remote/remote-control-context";

export function useWatchNavigation() {
  const router = useRouter();
  const remote = useRemoteControl();
  const [navError, setNavError] = useState<string | null>(null);
  const navigationInFlightRef = useRef(false);

  const playChannel = useCallback(
    (ch: Pick<M3uChannel, "url" | "name"> & Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle" | "tvgId" | "providerId" | "contentType">> & { playback?: CreateWatchInput["playback"] }) => {
      if (navigationInFlightRef.current) return;

      navigationInFlightRef.current = true;
      setNavError(null);

      const token = beginPlaybackNavigation({
        title: ch.name,
        message: remote?.activeSession
          ? "Preparing stream for your TV…"
          : "Preparing secure stream…",
      });

      void (async () => {
        try {
          const playback = playbackMetaForChannel(ch);
          const playable = {
            ...ch,
            ...(playback ? { playback } : {}),
          };
          if (remote?.activeSession) {
            const sent = await remote.sendPlayChannel(playable);
            if (!sent) throw new Error("Could not send this to the TV.");
            endPlaybackNavigation(token);
            return;
          }
          const href = await createWatchUrl(playable);
          router.push(href);
        } catch (err) {
          endPlaybackNavigation(token);
          setNavError(err instanceof Error ? err.message : "Could not start playback.");
        } finally {
          navigationInFlightRef.current = false;
        }
      })();
    },
    [remote, router],
  );

  const openChannel = useCallback(
    (ch: Pick<M3uChannel, "url" | "name"> & Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle" | "tvgId" | "providerId" | "providerChannelId" | "contentType">> & { playback?: CreateWatchInput["playback"] }) => {
      if (navigationInFlightRef.current) return;
      const contentType = resolveLibraryContentType(ch as M3uChannel);
      if (contentType === "series") {
        const href = showPageHrefFromChannel(ch as M3uChannel);
        if (href) {
          navigationInFlightRef.current = true;
          setNavError(null);
          const token = beginPlaybackNavigation({
            title: ch.name,
            message: remote?.activeSession
              ? "Sending to your TV…"
              : "Opening series…",
          });
          if (remote?.activeSession) {
            void remote
              .sendNavigate(href)
              .then((sent) => {
                if (!sent) throw new Error("Could not send this to the TV.");
                router.push(href);
              })
              .catch(() => setNavError("Could not send this to the TV."))
              .finally(() => {
                navigationInFlightRef.current = false;
                endPlaybackNavigation(token);
              });
            return;
          }
          router.push(href);
          navigationInFlightRef.current = false;
          return;
        }
      }
      if (contentType === "movie") {
        const href = moviePageHrefFromChannel(ch as M3uChannel);
        if (href) {
          navigationInFlightRef.current = true;
          setNavError(null);
          const token = beginPlaybackNavigation({
            title: ch.name,
            message: remote?.activeSession ? "Sending to your TV…" : "Opening movie…",
          });
          if (remote?.activeSession) {
            void remote.sendNavigate(href).then((sent) => {
              if (!sent) throw new Error("Could not send this to the TV.");
              router.push(href);
            }).catch(() => setNavError("Could not send this to the TV.")).finally(() => {
              navigationInFlightRef.current = false;
              endPlaybackNavigation(token);
            });
            return;
          }
          router.push(href);
          navigationInFlightRef.current = false;
          return;
        }
      }
      playChannel(ch);
    },
    [playChannel, remote, router],
  );

  const clearNavError = useCallback(() => setNavError(null), []);

  return { openChannel, playChannel, navError, clearNavError };
}
