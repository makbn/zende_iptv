import { createClientId } from "@/lib/browser/client-id";

export const PLAYBACK_NAVIGATION_START_EVENT =
  "zende:playback-navigation-start";
export const PLAYBACK_NAVIGATION_END_EVENT = "zende:playback-navigation-end";

export type PlaybackNavigationStartDetail = {
  token: string;
  title: string;
  message: string;
};

export type PlaybackNavigationEndDetail = {
  token: string;
};

let activeToken: string | null = null;

export function beginPlaybackNavigation({
  title,
  message,
}: Omit<PlaybackNavigationStartDetail, "token">) {
  const token = createClientId("playback");
  activeToken = token;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<PlaybackNavigationStartDetail>(
        PLAYBACK_NAVIGATION_START_EVENT,
        { detail: { token, title, message } },
      ),
    );
  }

  return token;
}

export function endPlaybackNavigation(token: string) {
  if (activeToken === token) activeToken = null;
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<PlaybackNavigationEndDetail>(
      PLAYBACK_NAVIGATION_END_EVENT,
      { detail: { token } },
    ),
  );
}

/** Hides the current playback overlay once the destination player is actually ready. */
export function endActivePlaybackNavigation() {
  if (!activeToken) return;
  endPlaybackNavigation(activeToken);
}
