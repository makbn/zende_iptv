import type { PlaybackMode } from "@/lib/stream/playback-url";

import { streamSessionIdFromUrl } from "./playback-telemetry";

const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/**
 * Return the HLS compatibility URL when a native progressive source is rejected
 * by the browser. Providers sometimes label MPEG-PS or other legacy media as
 * `.mp4`; the existing server transcoder can turn those streams into H.264/AAC.
 */
export function progressiveCompatibilityUrl(input: {
  src: string;
  playbackMode?: PlaybackMode;
  mediaErrorCode?: number;
}): string | null {
  if (
    input.playbackMode !== "progressive" ||
    input.mediaErrorCode !== MEDIA_ERR_SRC_NOT_SUPPORTED ||
    !/\/api\/stream\/proxy\//.test(input.src)
  ) {
    return null;
  }

  const sessionId = streamSessionIdFromUrl(input.src);
  return sessionId
    ? `/api/stream/transcode/${encodeURIComponent(sessionId)}.m3u8`
    : null;
}
