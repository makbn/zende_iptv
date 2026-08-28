import type { M3uChannel } from "@/core/playlist/m3u-parse";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";

export type RemotePlaybackState = {
  playbackId: string;
  active: boolean;
  title: string;
  logo: string | null;
  group: string | null;
  contentKind: "live" | "movie" | "episode" | "recording";
  currentTime: number;
  duration: number | null;
  playing: boolean;
  buffering: boolean;
  seekable: boolean;
};

export type RemotePlayableChannel = Pick<M3uChannel, "url" | "name"> &
  Partial<
    Pick<
      M3uChannel,
      "tvgLogo" | "groupTitle" | "tvgId" | "providerId" | "contentType"
    >
  > & {
    playback?: PlaybackSessionMeta;
  };

export type RemoteCommandInput =
  | { type: "navigate"; payload: { href: string } }
  | { type: "playMedia"; payload: { channel: RemotePlayableChannel } }
  | { type: "togglePlay" | "play" | "pause"; payload?: Record<string, never> }
  | { type: "skip"; payload: { seconds: number } }
  | { type: "seekTo"; payload: { seconds: number } };

export type RemoteCommand = RemoteCommandInput & {
  id: string;
  seq: number;
  createdAt: number;
};

export type RemoteSessionSummary = {
  sessionId: string;
  label: string;
  kind: "tv" | "desktop" | "other";
  pathname: string;
  playback: RemotePlaybackState | null;
  lastSeenAt: number;
  createdAt: number;
};
