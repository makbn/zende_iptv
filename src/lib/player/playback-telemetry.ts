export type PlaybackRange = { start: number; end: number };

type HlsTelemetryState = {
  currentLevel: number;
  nextLoadLevel: number;
  loadLevel: number;
  autoLevelEnabled: boolean;
  bandwidthEstimate: number;
  latency?: number | null;
  targetLatency?: number | null;
  maxLatency?: number | null;
  liveSyncPosition?: number | null;
  levels?: Array<{ height?: number; bitrate?: number; codecSet?: string }>;
};

type NetworkInformationLike = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

export function streamSessionIdFromUrl(src: string): string | null {
  const match = /\/api\/stream\/(?:proxy|transcode)\/([A-Za-z0-9_-]{8,128})(?:\.(?:mp4|m3u8))?(?:[/?#]|$)/.exec(src);
  return match?.[1] ?? null;
}

export function serializeTimeRanges(ranges: TimeRanges, limit = 12): PlaybackRange[] {
  const result: PlaybackRange[] = [];
  const startIndex = Math.max(0, ranges.length - limit);
  for (let index = startIndex; index < ranges.length; index++) {
    try {
      result.push({
        start: Math.round(ranges.start(index) * 100) / 100,
        end: Math.round(ranges.end(index) * 100) / 100,
      });
    } catch {
      break;
    }
  }
  return result;
}

function bufferAheadSeconds(currentTime: number, buffered: PlaybackRange[]): number {
  const containing = buffered.find(
    (range) => currentTime >= range.start - 0.1 && currentTime <= range.end + 0.1,
  );
  return containing ? Math.max(0, containing.end - currentTime) : 0;
}

/** A bounded, URL-free snapshot safe to ship asynchronously during playback. */
export function collectPlaybackTelemetry(
  video: HTMLVideoElement,
  hls: HlsTelemetryState | null,
) {
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const duration = Number.isFinite(video.duration) ? video.duration : null;
  const buffered = serializeTimeRanges(video.buffered);
  const seekable = serializeTimeRanges(video.seekable);
  const quality = video.getVideoPlaybackQuality?.();
  const connection = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection;

  return {
    media: {
      currentTime: Math.round(currentTime * 100) / 100,
      duration: duration === null ? null : Math.round(duration * 100) / 100,
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      ended: video.ended,
      seeking: video.seeking,
      playbackRate: video.playbackRate,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      buffered,
      seekable,
      bufferAhead: Math.round(bufferAheadSeconds(currentTime, buffered) * 100) / 100,
      droppedVideoFrames: quality?.droppedVideoFrames ?? null,
      totalVideoFrames: quality?.totalVideoFrames ?? null,
      corruptedVideoFrames: quality?.corruptedVideoFrames ?? null,
      mediaError: video.error
        ? { code: video.error.code, message: video.error.message.slice(0, 500) }
        : null,
    },
    hls: hls
      ? {
          currentLevel: hls.currentLevel,
          nextLoadLevel: hls.nextLoadLevel,
          loadLevel: hls.loadLevel,
          autoLevelEnabled: hls.autoLevelEnabled,
          bandwidthEstimate: Math.round(hls.bandwidthEstimate || 0),
          latency: Number.isFinite(hls.latency) ? hls.latency : null,
          targetLatency: Number.isFinite(hls.targetLatency) ? hls.targetLatency : null,
          maxLatency: Number.isFinite(hls.maxLatency) ? hls.maxLatency : null,
          liveSyncPosition: Number.isFinite(hls.liveSyncPosition)
            ? hls.liveSyncPosition
            : null,
          levels: (hls.levels ?? []).slice(0, 12).map((level) => ({
            height: level.height ?? null,
            bitrate: level.bitrate ?? null,
            codecSet: level.codecSet?.slice(0, 120) ?? null,
          })),
        }
      : null,
    environment: {
      online: navigator.onLine,
      visibility: document.visibilityState,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      connection: connection
        ? {
            effectiveType: connection.effectiveType ?? null,
            downlink: connection.downlink ?? null,
            rtt: connection.rtt ?? null,
            saveData: connection.saveData ?? null,
          }
        : null,
    },
  };
}
