import type { HlsConfig } from "hls.js";

import { Z_ACCESS } from "@/lib/auth/token-storage-keys";

function storedAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(Z_ACCESS);
  } catch {
    return null;
  }
}

function addStreamAuthorization(headers: Headers): Headers {
  const accessToken = storedAccessToken();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

/**
 * Tuned for typical IPTV / sports HLS (often **not** LL-HLS).
 * `lowLatencyMode: true` keeps the playhead glued to the live edge with tiny buffers,
 * which commonly causes **constant stalling** on regular live playlists — leave it off unless
 * you know the source is true low-latency HLS.
 */
export function getStreamHlsConfig(): Partial<HlsConfig> {
  return {
    // Native media elements cannot add headers, but hls.js can. This is required
    // for TV codec fallbacks, whose manifest and segment routes are owner-gated.
    xhrSetup(xhr) {
      const accessToken = storedAccessToken();
      if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.withCredentials = true;
    },
    fetchSetup(context, initParams) {
      return new Request(context.url, {
        ...initParams,
        credentials: "same-origin",
        headers: addStreamAuthorization(new Headers(initParams.headers)),
      });
    },

    enableWorker: true,
    lowLatencyMode: false,

    // ManagedMediaSource (default in hls.js 1.6+) rejects some IPTV AAC profiles
    // (e.g. mp4a.40.1) on Chrome — regular MSE is more compatible.
    preferManagedMediaSource: false,

    // IPTV feeds often have short GOPs / odd A/V alignment.
    stretchShortVideoTrack: true,
    forceKeyFrameOnDiscontinuity: true,

    // Prefer AAC-LC when manifest omits or mislabels audio codec.
    defaultAudioCodec: "mp4a.40.2",

    // Stay three segments behind the edge. Some Xtream providers expose only six
    // segments, so using six here starts at the oldest item in the entire window.
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,

    // Larger forward buffer reduces “always buffering” on uneven segment delivery.
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    backBufferLength: 60,

    maxBufferHole: 0.5,
    maxFragLookUpTolerance: 0.25,

    startLevel: -1,

    // Avoid aggressive catch-up that can feel like endless buffering on bad networks.
    maxLiveSyncPlaybackRate: 1.15,

    capLevelToPlayerSize: true,
    ignoreDevicePixelRatio: false,
  };
}
