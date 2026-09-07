import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";

export type MediaShareKind = "live" | "movie" | "episode" | "series";

export type MediaShareItemInput = {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  playback?: PlaybackSessionMeta;
};

export type MediaShareTarget = {
  kind: MediaShareKind;
  title: string;
  logo?: string;
  group?: string;
  description?: string;
  items: MediaShareItemInput[];
};

export type PublicMediaShareItem = Omit<MediaShareItemInput, "url" | "playback"> & {
  durationSeconds?: number;
};

export type PublicMediaShare = {
  kind: MediaShareKind;
  title: string;
  logo: string | null;
  group: string | null;
  description: string | null;
  expiresAt: string;
  items: PublicMediaShareItem[];
};
