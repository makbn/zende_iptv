import type { M3uChannel } from "@/core/playlist/m3u-parse";
import {
  contentTypeFromStreamUrl,
  isXtreamSeriesContainer,
  resolveLibraryContentType,
} from "@/lib/channels/content-type";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";

/** Playback session meta for watch — avoids mislabeling VOD as live. */
export function playbackMetaForChannel(
  channel: Pick<M3uChannel, "url" | "name" | "contentType" | "groupTitle"> & {
    playback?: PlaybackSessionMeta;
  },
): PlaybackSessionMeta | undefined {
  if (channel.playback?.contentKind) return channel.playback;

  if (isXtreamSeriesContainer(channel as M3uChannel)) return undefined;

  const libraryKind = resolveLibraryContentType(channel as M3uChannel);
  if (libraryKind === "movie") return { contentKind: "movie" };
  if (libraryKind === "series") return { contentKind: "episode" };
  if (libraryKind === "live") return { contentKind: "live" };

  const fromUrl = contentTypeFromStreamUrl(channel.url);
  if (fromUrl === "movie") return { contentKind: "movie" };
  if (fromUrl === "series") return { contentKind: "episode" };
  if (fromUrl === "live") return { contentKind: "live" };

  return undefined;
}
