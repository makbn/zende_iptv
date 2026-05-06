import { hashUrlAlias } from "@/lib/stream/stream-session-store";

function resolveAgainstPlaylist(playlistUrl: string, ref: string): string {
  const t = ref.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  try {
    return new URL(t, playlistUrl).href;
  } catch {
    return t;
  }
}

/**
 * Every rewritten URL uses `?h=` + stable hash → resolved server-side from the session alias map.
 * The session row only stores the **root** stream URL; manifests reference hundreds of distinct
 * upstream URLs (variants, playlists, `.ts`), so the proxy must know **which** URL this request
 * is for — either a short hash key into DB (`h`) or legacy full `u=` (still accepted).
 */
function proxyUrlFor(
  origin: string,
  sessionId: string,
  absoluteUrl: string,
  playlistFetchUrl: string,
  aliasSink: Map<string, string>,
  refererSink: Map<string, string>,
): string {
  const h = hashUrlAlias(absoluteUrl);
  aliasSink.set(h, absoluteUrl);
  /** Segment/key requests must send `Referer` for the playlist line that contained this URL. */
  refererSink.set(h, playlistFetchUrl);
  return `${origin}/api/stream/proxy/${sessionId}?h=${encodeURIComponent(h)}`;
}

/**
 * Rewrite playlist lines so every upstream URL is fetched via our proxy (`?h=` hash → DB).
 */
export function rewriteM3u8Playlist(args: {
  body: string;
  playlistFetchUrl: string;
  origin: string;
  sessionId: string;
  aliasSink: Map<string, string>;
  refererSink: Map<string, string>;
}): string {
  const { body, playlistFetchUrl, origin, sessionId, aliasSink, refererSink } =
    args;
  const lines = body.split(/\r?\n/);
  const out: string[] = [];

  const rewriteUriAttr = (line: string): string => {
    let s = line;
    s = s.replace(/URI="([^"]+)"/g, (_, inner: string) => {
      const resolved = resolveAgainstPlaylist(playlistFetchUrl, inner);
      const proxied = proxyUrlFor(
        origin,
        sessionId,
        resolved,
        playlistFetchUrl,
        aliasSink,
        refererSink,
      );
      return `URI="${proxied}"`;
    });
    s = s.replace(/URI='([^']+)'/g, (_, inner: string) => {
      const resolved = resolveAgainstPlaylist(playlistFetchUrl, inner);
      const proxied = proxyUrlFor(
        origin,
        sessionId,
        resolved,
        playlistFetchUrl,
        aliasSink,
        refererSink,
      );
      return `URI='${proxied}'`;
    });
    return s;
  };

  for (const line of lines) {
    const trimmedEnd = line.replace(/\r$/, "");
    if (trimmedEnd.trim() === "") {
      out.push(line);
      continue;
    }
    if (trimmedEnd.startsWith("#")) {
      out.push(rewriteUriAttr(trimmedEnd));
      continue;
    }
    const resolved = resolveAgainstPlaylist(playlistFetchUrl, trimmedEnd);
    out.push(
      proxyUrlFor(
        origin,
        sessionId,
        resolved,
        playlistFetchUrl,
        aliasSink,
        refererSink,
      ),
    );
  }

  return out.join("\n");
}

export function looksLikeHlsPlaylist(
  body: string,
  contentType: string | null,
  resourceUrl: string,
): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (
    ct.includes("application/vnd.apple.mpegurl") ||
    ct.includes("application/x-mpegurl") ||
    ct.includes("audio/mpegurl")
  ) {
    return true;
  }
  if (/\.m3u8(\?|$)/i.test(resourceUrl)) return true;
  const head = body.slice(0, 16).trimStart();
  return head.startsWith("#EXTM3U") || head.startsWith("#EXTINF");
}
