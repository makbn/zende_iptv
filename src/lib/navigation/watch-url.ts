import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { readUnwrapPublicCorsProxyUrlsPref } from "@/lib/stream/unwrap-public-cors-proxy-pref";
import type { PlaybackMode } from "@/lib/stream/playback-url";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";

export type WatchSessionMeta = {
  title: string;
  logo: string | null;
  group: string | null;
  /** Same-origin path — pass to `StreamPlayer` / `<video>`. */
  playbackUrl: string;
  /** Original upstream URL — stats / frequent ring only (not in address bar). */
  canonicalUrl: string;
  /** How the player should attach (HLS vs direct file). */
  playbackMode?: PlaybackMode;
  /** Server is converting an incompatible source to a sequential browser-safe stream. */
  transcoded?: boolean;
  /** VOD duration + episode navigation context. */
  playback?: PlaybackSessionMeta;
};

export type CreateWatchInput = Pick<M3uChannel, "url" | "name"> &
  Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle" | "providerId" | "tvgId">> & {
    playback?: PlaybackSessionMeta;
  };

/**
 * Creates a server-side stream session and returns `/watch?id=…`
 * (opaque id — no upstream URL in the browser location bar).
 */
export async function createWatchUrl(
  channel: CreateWatchInput,
  opts?: {
    /** Pre-seed cookie jar for gated streams (name → value, scoped to stream origin). */
    cookies?: Record<string, string>;
  },
): Promise<string> {
  const id = await createStreamSessionId(channel, opts);
  return `/watch?id=${encodeURIComponent(id)}`;
}

/** Creates a stream session and returns a same-origin attachment URL for progressive VOD. */
export async function createDownloadUrl(
  channel: CreateWatchInput,
  opts?: {
    cookies?: Record<string, string>;
  },
): Promise<string> {
  const id = await createStreamSessionId(channel, opts, "Could not start download.");
  return `/api/stream/proxy/${encodeURIComponent(id)}?download=1`;
}

async function createStreamSessionId(
  channel: CreateWatchInput,
  opts?: {
    cookies?: Record<string, string>;
  },
  failureMessage = "Could not start playback.",
): Promise<string> {
  const playback: PlaybackSessionMeta = {
    ...channel.playback,
    ...(channel.providerId?.trim() ? { guideProviderId: channel.providerId.trim() } : {}),
    ...(channel.tvgId?.trim() ? { guideTvgId: channel.tvgId.trim() } : {}),
  };
  const res = await zendeFetch("/api/stream/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: channel.url,
      title: channel.name?.trim() || "Live",
      logo: channel.tvgLogo,
      group: channel.groupTitle,
      meta: playback,
      unwrapPublicCorsProxyUrls: readUnwrapPublicCorsProxyUrlsPref(),
      ...(opts?.cookies ? { cookies: opts.cookies } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : failureMessage,
    );
  }
  if (!body.id) throw new Error(failureMessage);
  return body.id;
}

export async function fetchWatchSessionMeta(
  sessionId: string,
): Promise<WatchSessionMeta> {
  const res = await zendeFetch(
    `/api/stream/session/${encodeURIComponent(sessionId)}`,
  );
  const body = (await res.json().catch(() => ({}))) as WatchSessionMeta & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Playback session expired.",
    );
  }
  return {
    title: body.title,
    logo: body.logo ?? null,
    group: body.group ?? null,
    playbackUrl: body.playbackUrl,
    canonicalUrl: body.canonicalUrl,
    playbackMode: body.playbackMode,
    transcoded: body.transcoded,
    playback: body.playback,
  };
}

export async function fetchRecordingWatchMeta(
  recordingId: string,
): Promise<WatchSessionMeta> {
  const res = await zendeFetch(
    `/api/recordings/${encodeURIComponent(recordingId)}/watch-meta`,
  );
  const body = (await res.json().catch(() => ({}))) as WatchSessionMeta & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Recording unavailable.",
    );
  }
  return {
    title: body.title,
    logo: body.logo ?? null,
    group: body.group ?? null,
    playbackUrl: body.playbackUrl,
    canonicalUrl: body.canonicalUrl,
    playbackMode: body.playbackMode,
    transcoded: body.transcoded,
    playback: body.playback,
  };
}
