import type { SeriesEpisodeRow } from "@/app/api/xtream/series-info/route";
import { cleanMediaDisplayTitle } from "@/lib/channel/channel-label";
import type {
  PlaybackNeighborRef,
  PlaybackSessionMeta,
} from "@/lib/playback/stream-session-meta";
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

export function formatEpisodeCode(season: string, episodeNum: string): string {
  return `S${season}E${episodeNum || "?"}`;
}

export function neighborFromEpisode(
  episode: SeriesEpisodeRow,
  episodeIndex: number,
): PlaybackNeighborRef {
  return {
    season: episode.season,
    episodeNum: episode.episodeNum,
    title: cleanMediaDisplayTitle(episode.title) || episode.title,
    playUrl: episode.playUrl,
    episodeIndex,
    ...(episode.durationSeconds ? { durationSeconds: episode.durationSeconds } : {}),
  };
}

export function episodeRowFromNeighbor(ref: PlaybackNeighborRef): SeriesEpisodeRow {
  return {
    season: ref.season,
    episodeNum: ref.episodeNum,
    title: ref.title,
    playUrl: ref.playUrl?.trim() || "",
    ...(ref.durationSeconds ? { durationSeconds: ref.durationSeconds } : {}),
  };
}

/** Attach hasPrevious / hasNext and neighbor play links for the episode at `episodeIndex`. */
export function applyEpisodeNeighbors(
  playback: PlaybackSessionMeta,
  episodes: SeriesEpisodeRow[],
  episodeIndex: number,
): PlaybackSessionMeta {
  if (episodeIndex < 0 || episodes.length === 0) {
    return {
      ...playback,
      hasPrevious: false,
      hasNext: false,
    };
  }
  const previous =
    episodeIndex > 0 ? neighborFromEpisode(episodes[episodeIndex - 1]!, episodeIndex - 1) : undefined;
  const next =
    episodeIndex < episodes.length - 1
      ? neighborFromEpisode(episodes[episodeIndex + 1]!, episodeIndex + 1)
      : undefined;
  return {
    ...playback,
    episodeIndex,
    hasPrevious: Boolean(previous),
    hasNext: Boolean(next),
    ...(previous ? { previous } : { previous: undefined }),
    ...(next ? { next } : { next: undefined }),
  };
}

/** Clean titles + episode code lines for player chrome. */
export function applyPlaybackDisplayFields(
  playback: PlaybackSessionMeta,
  fallbackTitle = "",
): PlaybackSessionMeta {
  const cleanSeries = cleanMediaDisplayTitle(playback.seriesTitle);
  const cleanEpisode = cleanMediaDisplayTitle(playback.episodeTitle);
  const cleanSearch = cleanMediaDisplayTitle(playback.searchTitle);
  const cleanFallback = cleanMediaDisplayTitle(fallbackTitle);

  if (playback.contentKind === "episode" || playback.seriesId) {
    const code =
      playback.season != null && playback.season !== ""
        ? formatEpisodeCode(playback.season, playback.episodeNum ?? "")
        : "";
    const displayTitle = cleanSeries || cleanSearch || cleanFallback;
    const displaySubtitle = [code, cleanEpisode].filter(Boolean).join(" · ") || undefined;
    return {
      ...playback,
      ...(cleanSeries ? { seriesTitle: cleanSeries } : {}),
      ...(cleanEpisode ? { episodeTitle: cleanEpisode } : {}),
      searchTitle: cleanSeries || cleanSearch || playback.searchTitle,
      displayTitle: displayTitle || undefined,
      displaySubtitle,
    };
  }

  if (playback.contentKind === "movie") {
    const displayTitle = cleanSearch || cleanFallback;
    return {
      ...playback,
      searchTitle: displayTitle || playback.searchTitle,
      displayTitle: displayTitle || undefined,
      ...(playback.year?.trim() ? { displaySubtitle: playback.year.trim() } : {}),
      hasPrevious: false,
      hasNext: false,
    };
  }

  const displayTitle = cleanFallback || cleanSearch;
  return {
    ...playback,
    displayTitle: displayTitle || undefined,
  };
}

export function buildEpisodeWatchChannel(args: {
  seriesId: string;
  seriesTitle: string;
  cover?: string;
  groupTitle?: string;
  episode: SeriesEpisodeRow;
  episodeIndex: number;
  imdbId?: string;
  tmdbId?: string;
  year?: string;
  /** When provided, seeds previous/next neighbor links on the session. */
  allEpisodes?: SeriesEpisodeRow[];
}): CreateWatchInput {
  const seriesTitle =
    cleanMediaDisplayTitle(args.seriesTitle) || args.seriesTitle.trim() || "Show";
  const episodeTitle =
    cleanMediaDisplayTitle(args.episode.title) || args.episode.title || "Episode";
  const code = formatEpisodeCode(args.episode.season, args.episode.episodeNum);
  const label = `${code} · ${episodeTitle}`;
  let playback: PlaybackSessionMeta = {
    contentKind: "episode",
    seriesId: args.seriesId,
    seriesTitle,
    season: args.episode.season,
    episodeNum: args.episode.episodeNum,
    episodeTitle,
    episodeIndex: args.episodeIndex,
    searchTitle: seriesTitle,
    displayTitle: seriesTitle,
    displaySubtitle: label,
    ...(args.episode.durationSeconds
      ? { durationSeconds: args.episode.durationSeconds }
      : {}),
    ...(args.imdbId?.trim() ? { imdbId: args.imdbId.trim() } : {}),
    ...(args.tmdbId?.trim() ? { tmdbId: args.tmdbId.trim() } : {}),
    ...(args.year?.trim() ? { year: args.year.trim() } : {}),
  };
  if (args.allEpisodes?.length) {
    playback = applyEpisodeNeighbors(playback, args.allEpisodes, args.episodeIndex);
  }
  return {
    url: args.episode.playUrl,
    name: `${seriesTitle} · ${label}`,
    ...(args.cover ? { tvgLogo: args.cover } : {}),
    ...(args.groupTitle ? { groupTitle: args.groupTitle } : {}),
    playback,
  };
}
