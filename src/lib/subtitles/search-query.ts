import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import type { SubtitleSearchQuery } from "@/lib/subtitles/types";

export type SubtitleSearchContext = {
  title: string;
  playback?: PlaybackSessionMeta;
};

export function parseMediaIdOverride(
  input: string,
): Pick<SubtitleSearchQuery, "imdbId" | "tmdbId"> {
  const trimmed = input.trim();
  if (!trimmed) return {};
  if (/^tt\d+$/i.test(trimmed)) {
    return { imdbId: trimmed.toLowerCase() };
  }
  if (/^\d+$/.test(trimmed)) {
    return { tmdbId: trimmed };
  }
  return {};
}

export function hasResolvableMediaId(
  ctx: SubtitleSearchContext,
  opts?: { selectedTmdbId?: string; mediaIdInput?: string },
): boolean {
  const override = parseMediaIdOverride(opts?.mediaIdInput ?? "");
  return Boolean(
    opts?.selectedTmdbId ||
      override.imdbId ||
      override.tmdbId ||
      ctx.playback?.imdbId,
  );
}

/** Build a Wyzie Subs query from watch session metadata. */
export function buildSubtitleSearchQuery(
  ctx: SubtitleSearchContext,
  opts?: {
    languages?: string;
    selectedTmdbId?: string;
    selectedMediaType?: "movie" | "tv";
    releaseFilter?: string;
    mediaIdInput?: string;
  },
): SubtitleSearchQuery {
  const playback = ctx.playback;
  const languages = opts?.languages?.trim() || "en";
  const mediaOverride = parseMediaIdOverride(opts?.mediaIdInput ?? "");

  const imdbId = mediaOverride.imdbId ?? playback?.imdbId;
  const tmdbId = opts?.selectedTmdbId ?? mediaOverride.tmdbId;
  const releaseFilter = opts?.releaseFilter?.trim() || undefined;

  const season = playback?.season ? Number.parseInt(playback.season, 10) : undefined;
  const episode = playback?.episodeNum ? Number.parseInt(playback.episodeNum, 10) : undefined;
  const isEpisode =
    playback?.contentKind === "episode" ||
    (opts?.selectedMediaType === "tv" && Boolean(season || episode));

  if (isEpisode) {
    return {
      languages,
      type: "episode",
      imdbId,
      tmdbId,
      season: Number.isFinite(season) ? season : undefined,
      episode: Number.isFinite(episode) ? episode : undefined,
      releaseFilter,
    };
  }

  return {
    languages,
    type: "movie",
    imdbId,
    tmdbId,
    releaseFilter,
  };
}

export function formatSubtitleSearchLabel(ctx: SubtitleSearchContext): string {
  const playback = ctx.playback;
  if (playback?.contentKind === "episode") {
    const series = playback.seriesTitle?.trim() || ctx.title;
    const season = playback.season?.trim();
    const episode = playback.episodeNum?.trim();
    if (season && episode) return `${series} · S${season}E${episode}`;
    return series;
  }
  return parseChannelLabel(ctx.title).displayName;
}

export function defaultTitleQuery(ctx: SubtitleSearchContext): string {
  const playback = ctx.playback;
  if (playback?.contentKind === "episode") {
    return playback.seriesTitle?.trim() || parseChannelLabel(ctx.title).displayName;
  }
  return playback?.searchTitle?.trim() || parseChannelLabel(ctx.title).displayName;
}
