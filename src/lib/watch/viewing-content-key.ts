import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";

export type ViewingContentIdentity = {
  url: string;
  name?: string;
  playback?: PlaybackSessionMeta;
};

function identityToken(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 320);
}

function episodeSeriesTitle(value: string | undefined): string {
  return (value ?? "")
    .replace(/\bseason\s*0*\d+\s*episode\s*0*\d+\b/gi, " ")
    .replace(/\bs(?:eason)?\s*0*\d+\s*e(?:pisode)?\s*0*\d+\b/gi, " ")
    .replace(/\bs0*\d+e0*\d+\b/gi, " ")
    .replace(/[·|:\s-]+$/g, " ")
    .trim();
}

function inferredKind(input: ViewingContentIdentity): PlaybackSessionMeta["contentKind"] {
  if (input.playback?.contentKind) return input.playback.contentKind;
  if (/\/series\//i.test(input.url)) return "episode";
  if (/\/movie\//i.test(input.url)) return "movie";
  return undefined;
}

/**
 * Stable identity for a Continue Watching title.
 * Episodes intentionally share their series key while each movie keeps one key.
 */
export function viewingContentKey(input: ViewingContentIdentity): string {
  const playback = input.playback;
  const contentKind = inferredKind(input);
  if (contentKind === "episode") {
    // Prefer the human title so legacy rows without a series id merge with
    // newer episode metadata. Episode codes are stripped from old row names.
    const seriesTitle = identityToken(
      episodeSeriesTitle(
        playback?.seriesTitle || playback?.searchTitle || input.name,
      ),
    );
    if (seriesTitle) return `series:title:${seriesTitle}`;

    const seriesId = identityToken(playback?.seriesId);
    if (seriesId) return `series:id:${seriesId}`;

    const imdbId = identityToken(playback?.imdbId);
    if (imdbId) return `series:imdb:${imdbId}`;
  }

  if (contentKind === "movie") {
    const title = identityToken(playback?.searchTitle || input.name);
    const year = identityToken(playback?.year);
    if (title) return `movie:title:${title}${year ? `:${year}` : ""}`;

    const imdbId = identityToken(playback?.imdbId);
    if (imdbId) return `movie:imdb:${imdbId}`;
  }

  return `url:${input.url.trim()}`;
}
