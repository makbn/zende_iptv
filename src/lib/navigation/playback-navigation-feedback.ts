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

export function beginPlaybackNavigation({
  title,
  message,
}: Omit<PlaybackNavigationStartDetail, "token">) {
  const token = crypto.randomUUID();

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
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<PlaybackNavigationEndDetail>(
      PLAYBACK_NAVIGATION_END_EVENT,
      { detail: { token } },
    ),
  );
}
