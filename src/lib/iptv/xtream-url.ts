import type { XtreamCredentials, XtreamSeriesEpisode, XtreamVodInfo } from "@/lib/iptv/xtream-types";

/** Sentinel URL for a series container row (not directly playable). */
export const XTREAM_SERIES_URL_PREFIX = "zende://series/";

export function buildXtreamSeriesContainerUrl(seriesId: string | number): string {
  return `${XTREAM_SERIES_URL_PREFIX}${encodeURIComponent(String(seriesId))}`;
}

export function parseXtreamSeriesIdFromContainerUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith(XTREAM_SERIES_URL_PREFIX)) return null;
  const id = decodeURIComponent(trimmed.slice(XTREAM_SERIES_URL_PREFIX.length)).trim();
  return id || null;
}

export function normalizeServerUrl(serverUrl: string): string {
  const raw = serverUrl.trim();
  const withProto =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `http://${raw}`;
  const u = new URL(withProto);
  return `${u.protocol}//${u.host}`;
}

/** Active portal host from primary / backup settings. */
export function activeXtreamServerUrl(provider: {
  serverUrl?: string | null;
  backupServerUrl?: string | null;
  useBackupServer?: boolean | null;
}): string | null {
  const primary = provider.serverUrl?.trim() || "";
  const backup = provider.backupServerUrl?.trim() || "";
  const chosen =
    provider.useBackupServer && backup ? backup : primary || backup;
  if (!chosen) return null;
  try {
    return normalizeServerUrl(chosen);
  } catch {
    return null;
  }
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

/** Pathname segments for `/live|movie|series/...` URLs or host-free paths. */
export function xtreamPathSegments(urlOrPath: string): string[] | null {
  const trimmed = urlOrPath.trim();
  if (!trimmed || trimmed.startsWith(XTREAM_SERIES_URL_PREFIX)) return null;
  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  } else if (!trimmed.startsWith("/")) {
    pathname = `/${trimmed}`;
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 4) return null;
  if (parts[0] !== "live" && parts[0] !== "movie" && parts[0] !== "series") return null;
  return parts;
}

/**
 * Persist Xtream streams as host-free paths when the URL host is the portal
 * (primary/backup). If the content CDN host differs — e.g. portal
 * `kfnrinpe…` but stream `ex.fhkadvnp.com/movie/…` — keep the absolute URL so
 * that host is not lost. Non-Xtream URLs are unchanged.
 */
export function toXtreamStorageUrl(
  urlOrPath: string,
  portalHosts?: Iterable<string | null | undefined>,
): string {
  const trimmed = urlOrPath.trim();
  if (!trimmed || trimmed.startsWith(XTREAM_SERIES_URL_PREFIX)) return trimmed;
  const parts = xtreamPathSegments(trimmed);
  if (!parts) return trimmed;
  const path = `/${parts.join("/")}`;
  if (!/^https?:\/\//i.test(trimmed)) return path;

  let origin: string;
  let search = "";
  try {
    const u = new URL(trimmed);
    origin = `${u.protocol}//${u.host}`;
    search = u.search;
  } catch {
    return path;
  }

  const known = normalizePortalHostSet(portalHosts);
  if (known.size > 0 && !known.has(origin)) {
    // Distinct content host — preserve it.
    return `${origin}${path}${search}`;
  }
  return path;
}

/** Always the path portion — used for stable catalog identity / externalKey. */
export function toXtreamStoragePath(urlOrPath: string): string {
  const trimmed = urlOrPath.trim();
  if (!trimmed || trimmed.startsWith(XTREAM_SERIES_URL_PREFIX)) return trimmed;
  const parts = xtreamPathSegments(trimmed);
  if (!parts) return trimmed;
  return `/${parts.join("/")}`;
}

function normalizePortalHostSet(
  portalHosts?: Iterable<string | null | undefined>,
): Set<string> {
  const known = new Set<string>();
  if (!portalHosts) return known;
  for (const host of portalHosts) {
    const raw = host?.trim();
    if (!raw) continue;
    try {
      known.add(normalizeServerUrl(raw));
    } catch {
      // ignore invalid portal host entries
    }
  }
  return known;
}

/**
 * Join active portal host onto a stored path. Absolute URLs whose host is not
 * the portal (primary/backup) keep that content host — we cannot invent it
 * from the path alone.
 */
export function resolveXtreamPlayUrl(
  serverUrl: string,
  storedUrlOrPath: string,
  portalHosts?: Iterable<string | null | undefined>,
): string {
  const trimmed = storedUrlOrPath.trim();
  if (!trimmed || trimmed.startsWith(XTREAM_SERIES_URL_PREFIX)) return trimmed;
  const parts = xtreamPathSegments(trimmed);
  if (!parts) return trimmed;
  const path = `/${parts.join("/")}`;
  const active = normalizeServerUrl(serverUrl);
  let search = "";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      search = u.search;
      const origin = `${u.protocol}//${u.host}`;
      const known = normalizePortalHostSet(portalHosts);
      // Only preserve a distinct CDN host when we know the portal hosts.
      // Without that list, rewrite onto the active server (legacy behavior).
      if (known.size > 0) {
        known.add(active);
        if (!known.has(origin)) {
          return `${origin}${path}${search}`;
        }
      }
    } catch {
      search = "";
    }
  }
  return `${active}${path}${search}`;
}

export function buildXtreamLivePath(
  creds: Pick<XtreamCredentials, "username" | "password" | "liveFormat">,
  streamId: string | number,
  format = "ts",
): string {
  const user = encodePathSegment(creds.username);
  const pass = encodePathSegment(creds.password);
  const fmt = (format || creds.liveFormat || "m3u8").trim() || "m3u8";
  return `/live/${user}/${pass}/${encodeURIComponent(String(streamId))}.${fmt}`;
}

export function buildXtreamMoviePath(
  creds: Pick<XtreamCredentials, "username" | "password">,
  streamId: string | number,
  containerExtension: string,
): string {
  const user = encodePathSegment(creds.username);
  const pass = encodePathSegment(creds.password);
  const ext = containerExtension.trim() || "mp4";
  return `/movie/${user}/${pass}/${encodeURIComponent(String(streamId))}.${encodeURIComponent(ext)}`;
}

export function buildXtreamEpisodePath(
  creds: Pick<XtreamCredentials, "username" | "password">,
  episode: Pick<XtreamSeriesEpisode, "id"> & {
    container_extension?: string;
  },
): string {
  const user = encodePathSegment(creds.username);
  const pass = encodePathSegment(creds.password);
  const ext = (episode.container_extension ?? "").trim() || "mp4";
  return `/series/${user}/${pass}/${encodeURIComponent(String(episode.id))}.${encodeURIComponent(ext)}`;
}

/**
 * Live: `{server}/live/{user}/{pass}/{streamId}.{format}`
 * IPTVnator: XtreamUrlService.constructLiveUrl
 */
export function buildXtreamLiveUrl(
  creds: XtreamCredentials,
  streamId: string | number,
  format = "ts",
): string {
  return resolveXtreamPlayUrl(creds.serverUrl, buildXtreamLivePath(creds, streamId, format));
}

/**
 * Movie: `{server}/movie/{user}/{pass}/{streamId}.{ext}`
 * IPTVnator: XtreamUrlService.constructVodUrl
 */
export function buildXtreamMovieUrl(
  creds: XtreamCredentials,
  streamId: string | number,
  containerExtension: string,
): string {
  return resolveXtreamPlayUrl(
    creds.serverUrl,
    buildXtreamMoviePath(creds, streamId, containerExtension),
  );
}

export function buildXtreamMovieUrlFromVodInfo(
  creds: XtreamCredentials,
  vod: XtreamVodInfo,
): string {
  const streamId = vod.movie_data?.stream_id;
  const ext = vod.movie_data?.container_extension;
  if (streamId == null || !ext) return "";
  return buildXtreamMovieUrl(creds, streamId, ext);
}

/**
 * Episode: `{server}/series/{user}/{pass}/{episodeId}.{ext}`
 * IPTVnator: XtreamUrlService.constructEpisodeUrl
 */
export function buildXtreamEpisodeUrl(
  creds: XtreamCredentials,
  episode: Pick<XtreamSeriesEpisode, "id"> & {
    container_extension?: string;
  },
): string {
  return resolveXtreamPlayUrl(creds.serverUrl, buildXtreamEpisodePath(creds, episode));
}

function parseXtreamIdFromBucketUrl(url: string, bucket: "movie" | "series" | "live"): string | null {
  const parts = xtreamPathSegments(url);
  if (!parts || parts[0] !== bucket) return null;
  const file = parts[3] ?? "";
  const m = /^(\d+)\./.exec(file);
  return m?.[1] ?? null;
}

export function parseXtreamVodIdFromStreamUrl(url: string): string | null {
  return parseXtreamIdFromBucketUrl(url, "movie");
}

export function parseXtreamEpisodeIdFromStreamUrl(url: string): string | null {
  return parseXtreamIdFromBucketUrl(url, "series");
}

export function parseXtreamLiveIdFromStreamUrl(url: string): string | null {
  return parseXtreamIdFromBucketUrl(url, "live");
}

/** Extract Xtream portal credentials embedded in `/live|movie|series/` URLs. */
export function parseXtreamCredentialsFromStreamUrl(url: string): XtreamCredentials | null {
  const trimmed = url.trim();
  const parts = xtreamPathSegments(trimmed);
  if (!parts) return null;
  const [bucket, username, password] = parts;
  if (bucket !== "live" && bucket !== "movie" && bucket !== "series") return null;
  if (!username || !password) return null;
  let serverUrl = "";
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      serverUrl = `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  }
  if (!serverUrl) return null;
  return {
    serverUrl,
    username: decodeURIComponent(username),
    password: decodeURIComponent(password),
  };
}
