import type { SeriesEpisodeRow } from "@/app/api/xtream/series-info/route";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import type { CreateWatchInput } from "@/lib/navigation/watch-url";

export function resolveSeriesEpisodeIndex(
  episodes: SeriesEpisodeRow[],
  playback: Pick<PlaybackSessionMeta, "episodeIndex" | "season" | "episodeNum">,
): number {
  const metadataIndex = playback.episodeIndex ?? -1;
  const indexedEpisode = episodes[metadataIndex];
  if (
    indexedEpisode &&
    indexedEpisode.season === playback.season &&
    indexedEpisode.episodeNum === playback.episodeNum
  ) {
    return metadataIndex;
  }
  return episodes.findIndex(
    (episode) =>
      episode.season === playback.season &&
      episode.episodeNum === playback.episodeNum,
  );
}

export function buildEpisodeWatchChannel(args: {
  seriesId: string;
  seriesTitle: string;
  cover?: string;
  groupTitle?: string;
  episode: SeriesEpisodeRow;
  episodeIndex: number;
}): CreateWatchInput {
  const { seriesTitle, episode, episodeIndex } = args;
  const label = `S${episode.season}E${episode.episodeNum || "?"} · ${episode.title}`;
  const playback: PlaybackSessionMeta = {
    contentKind: "episode",
    seriesId: args.seriesId,
    seriesTitle,
    season: episode.season,
    episodeNum: episode.episodeNum,
    episodeTitle: episode.title,
    episodeIndex,
    ...(episode.durationSeconds ? { durationSeconds: episode.durationSeconds } : {}),
  };
  return {
    url: episode.playUrl,
    name: `${seriesTitle} · ${label}`,
    ...(args.cover ? { tvgLogo: args.cover } : {}),
    ...(args.groupTitle ? { groupTitle: args.groupTitle } : {}),
    playback,
  };
}

export function formatEpisodeCode(season: string, episodeNum: string): string {
  return `S${season}E${episodeNum || "?"}`;
}
