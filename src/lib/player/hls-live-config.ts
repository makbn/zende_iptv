import type { HlsConfig } from "hls.js";

/**
 * Tuned for typical IPTV / sports HLS (often **not** LL-HLS).
 * `lowLatencyMode: true` keeps the playhead glued to the live edge with tiny buffers,
 * which commonly causes **constant stalling** on regular live playlists — leave it off unless
 * you know the source is true low-latency HLS.
 */
export function getStreamHlsConfig(): Partial<HlsConfig> {
  return {
    enableWorker: true,
    lowLatencyMode: false,

    // Softer live edge: stay slightly behind the manifest edge for stability.
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 120,

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
