import "server-only";

export type PlaybackContentKind = "live" | "movie" | "episode";

/** Adjacent episode the player can jump to without re-listing the whole series. */
export type PlaybackNeighborRef = {
  season: string;
  episodeNum: string;
  /** Clean episode title for UI. */
  title: string;
  /**
   * Opaque stream session id — client navigates to `/watch?id=…`.
   * Prefer this over `playUrl` so provider credentials never reach the browser.
   */
  watchId?: string;
  /** Upstream episode URL — server-only; never returned from session GET. */
  playUrl?: string;
  episodeIndex: number;
  durationSeconds?: number;
};

/** Stored in StreamProxySession.metaJson and returned to the watch UI. */
export type PlaybackSessionMeta = {
  contentKind?: PlaybackContentKind;
  /** Clean primary title for the player chrome (no [MULTI-SUB] / [EN] tags). */
  displayTitle?: string;
  /** Secondary line, e.g. `S1E2 · Episode name`. */
  displaySubtitle?: string;
  /** Provider-scoped guide identity for fast player EPG lookups. */
  guideProviderId?: string;
  guideTvgId?: string;
  durationSeconds?: number;
  seriesId?: string;
  seriesTitle?: string;
  season?: string;
  episodeNum?: string;
  episodeTitle?: string;
  /** Index in the flat sorted episode list from get_series_info. */
  episodeIndex?: number;
  /** Best-effort title for subtitle search (without quality/year noise). */
  searchTitle?: string;
  year?: string;
  imdbId?: string;
  tmdbId?: string;
  /**
   * Skip-intro windows from The Intro DB (`startMs` / `endMs`).
   * Empty array means looked up with no intro; omit when not yet resolved.
   */
  intro?: Array<{ startMs: number; endMs: number }>;
  hasPrevious?: boolean;
  hasNext?: boolean;
  previous?: PlaybackNeighborRef;
  next?: PlaybackNeighborRef;
};

function parseNeighbor(raw: unknown): PlaybackNeighborRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const season = typeof o.season === "string" ? o.season.trim() : "";
  const episodeNum = typeof o.episodeNum === "string" ? o.episodeNum.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const watchId = typeof o.watchId === "string" ? o.watchId.trim() : "";
  const playUrl = typeof o.playUrl === "string" ? o.playUrl.trim() : "";
  const episodeIndex =
    typeof o.episodeIndex === "number" && Number.isFinite(o.episodeIndex)
      ? Math.floor(o.episodeIndex)
      : -1;
  if (!season || episodeIndex < 0) return undefined;
  if (!watchId && !playUrl) return undefined;
  const durationSeconds =
    typeof o.durationSeconds === "number" &&
    Number.isFinite(o.durationSeconds) &&
    o.durationSeconds > 0
      ? Math.round(o.durationSeconds)
      : undefined;
  return {
    season,
    episodeNum,
    title,
    episodeIndex,
    ...(watchId ? { watchId } : {}),
    ...(playUrl ? { playUrl } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
  };
}

function parseIntroSegments(
  raw: unknown,
): Array<{ startMs: number; endMs: number }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const segments: Array<{ startMs: number; endMs: number }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const startMs = typeof o.startMs === "number" ? o.startMs : Number(o.startMs);
    const endMs = typeof o.endMs === "number" ? o.endMs : Number(o.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    segments.push({ startMs: Math.max(0, Math.round(startMs)), endMs: Math.round(endMs) });
  }
  return segments;
}

export function parsePlaybackSessionMeta(raw: string | null | undefined): PlaybackSessionMeta {
  if (!raw?.trim()) return {};
  try {
    const o = JSON.parse(raw) as PlaybackSessionMeta & { intro?: unknown };
    if (!o || typeof o !== "object") return {};
    const intro = Object.prototype.hasOwnProperty.call(o, "intro")
      ? parseIntroSegments(o.intro) ?? []
      : undefined;
    return {
      ...o,
      ...(intro !== undefined ? { intro } : {}),
      ...(o.previous ? { previous: parseNeighbor(o.previous) } : {}),
      ...(o.next ? { next: parseNeighbor(o.next) } : {}),
    };
  } catch {
    return {};
  }
}

function serializeNeighbor(ref: PlaybackNeighborRef | undefined): PlaybackNeighborRef | undefined {
  if (!ref?.season?.trim()) return undefined;
  if (!Number.isFinite(ref.episodeIndex) || ref.episodeIndex < 0) return undefined;
  const watchId = ref.watchId?.trim();
  const playUrl = ref.playUrl?.trim();
  if (!watchId && !playUrl) return undefined;
  return {
    season: ref.season.trim(),
    episodeNum: (ref.episodeNum ?? "").trim(),
    title: (ref.title ?? "").trim(),
    episodeIndex: Math.floor(ref.episodeIndex),
    ...(watchId ? { watchId } : {}),
    ...(playUrl ? { playUrl } : {}),
    ...(ref.durationSeconds != null &&
    Number.isFinite(ref.durationSeconds) &&
    ref.durationSeconds > 0
      ? { durationSeconds: Math.round(ref.durationSeconds) }
      : {}),
  };
}

export function serializePlaybackSessionMeta(meta: PlaybackSessionMeta): string {
  const clean: PlaybackSessionMeta = {};
  if (meta.contentKind) clean.contentKind = meta.contentKind;
  if (meta.displayTitle?.trim()) clean.displayTitle = meta.displayTitle.trim();
  if (meta.displaySubtitle?.trim()) clean.displaySubtitle = meta.displaySubtitle.trim();
  if (meta.guideProviderId?.trim()) clean.guideProviderId = meta.guideProviderId.trim();
  if (meta.guideTvgId?.trim()) clean.guideTvgId = meta.guideTvgId.trim();
  if (meta.durationSeconds != null && Number.isFinite(meta.durationSeconds) && meta.durationSeconds > 0) {
    clean.durationSeconds = Math.round(meta.durationSeconds);
  }
  if (meta.seriesId?.trim()) clean.seriesId = meta.seriesId.trim();
  if (meta.seriesTitle?.trim()) clean.seriesTitle = meta.seriesTitle.trim();
  if (meta.season?.trim()) clean.season = meta.season.trim();
  if (meta.episodeNum?.trim()) clean.episodeNum = meta.episodeNum.trim();
  if (meta.episodeTitle?.trim()) clean.episodeTitle = meta.episodeTitle.trim();
  if (meta.episodeIndex != null && Number.isFinite(meta.episodeIndex) && meta.episodeIndex >= 0) {
    clean.episodeIndex = Math.floor(meta.episodeIndex);
  }
  if (meta.searchTitle?.trim()) clean.searchTitle = meta.searchTitle.trim();
  if (meta.year?.trim()) clean.year = meta.year.trim();
  if (meta.imdbId?.trim()) clean.imdbId = meta.imdbId.trim();
  if (meta.tmdbId?.trim()) clean.tmdbId = meta.tmdbId.trim();
  if (meta.intro !== undefined) {
    clean.intro = meta.intro
      .filter(
        (s) =>
          s &&
          Number.isFinite(s.startMs) &&
          Number.isFinite(s.endMs) &&
          s.endMs > s.startMs,
      )
      .map((s) => ({
        startMs: Math.max(0, Math.round(s.startMs)),
        endMs: Math.round(s.endMs),
      }));
  }
  if (meta.hasPrevious != null) clean.hasPrevious = Boolean(meta.hasPrevious);
  if (meta.hasNext != null) clean.hasNext = Boolean(meta.hasNext);
  const previous = serializeNeighbor(meta.previous);
  const next = serializeNeighbor(meta.next);
  if (previous) clean.previous = previous;
  if (next) clean.next = next;
  return JSON.stringify(clean);
}

/** Parse Xtream `info.duration` / `runtime` — seconds, `HH:MM:SS`, or `MM:SS`. */
export function parseXtreamDurationSeconds(
  info: Record<string, unknown> | undefined,
): number | undefined {
  if (!info) return undefined;
  const raw =
    info.duration ??
    info.runtime ??
    info.episode_run_time ??
    info.duration_secs ??
    info.duration_sec;
  if (raw == null) return undefined;

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }

  const s = String(raw).trim();
  if (!s) return undefined;

  if (/^\d+$/.test(s)) {
    const n = Number.parseInt(s, 10);
    return n > 0 ? n : undefined;
  }

  const hms = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (hms) {
    const a = Number.parseInt(hms[1]!, 10);
    const b = Number.parseInt(hms[2]!, 10);
    const c = hms[3] != null ? Number.parseInt(hms[3], 10) : 0;
    if (hms[3] != null) return a * 3600 + b * 60 + c;
    return a * 60 + b;
  }

  const mins = /^(\d+(?:\.\d+)?)\s*min/i.exec(s);
  if (mins) {
    const n = Number.parseFloat(mins[1]!);
    return n > 0 ? Math.round(n * 60) : undefined;
  }

  return undefined;
}
