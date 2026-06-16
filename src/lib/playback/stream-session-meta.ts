import "server-only";

export type PlaybackContentKind = "live" | "movie" | "episode";

/** Stored in StreamProxySession.metaJson and returned to the watch UI. */
export type PlaybackSessionMeta = {
  contentKind?: PlaybackContentKind;
  durationSeconds?: number;
  seriesId?: string;
  seriesTitle?: string;
  season?: string;
  episodeNum?: string;
  episodeTitle?: string;
  /** Index in the flat sorted episode list from get_series_info. */
  episodeIndex?: number;
};

export function parsePlaybackSessionMeta(raw: string | null | undefined): PlaybackSessionMeta {
  if (!raw?.trim()) return {};
  try {
    const o = JSON.parse(raw) as PlaybackSessionMeta;
    if (!o || typeof o !== "object") return {};
    return o;
  } catch {
    return {};
  }
}

export function serializePlaybackSessionMeta(meta: PlaybackSessionMeta): string {
  const clean: PlaybackSessionMeta = {};
  if (meta.contentKind) clean.contentKind = meta.contentKind;
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
    return raw > 24 * 3600 ? raw : raw;
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
