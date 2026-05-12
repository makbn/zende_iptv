import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { readUnwrapPublicCorsProxyUrlsPref } from "@/lib/stream/unwrap-public-cors-proxy-pref";

/**
 * Creates a server-side stream session and returns `/watch?id=…`
 * (opaque id — no upstream URL in the browser location bar).
 */
export async function createWatchUrl(
  channel: Pick<M3uChannel, "url" | "name"> &
    Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle">>,
  opts?: {
    /** Pre-seed cookie jar for gated streams (name → value, scoped to stream origin). */
    cookies?: Record<string, string>;
  },
): Promise<string> {
  const res = await zendeFetch("/api/stream/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: channel.url,
      title: channel.name?.trim() || "Live",
      logo: channel.tvgLogo,
      group: channel.groupTitle,
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
      typeof body.error === "string" ? body.error : "Could not start playback.",
    );
  }
  if (!body.id) throw new Error("Could not start playback.");
  return `/watch?id=${encodeURIComponent(body.id)}`;
}

export type WatchSessionMeta = {
  title: string;
  logo: string | null;
  group: string | null;
  /** Same-origin path — pass to `StreamPlayer` / `<video>`. */
  playbackUrl: string;
  /** Original upstream URL — stats / frequent ring only (not in address bar). */
  canonicalUrl: string;
};

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
  };
}
