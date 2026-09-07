const TRANSCODE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const TRANSCODE_HLS_SEGMENT_SECONDS = 4;
export const TRANSCODE_HLS_CHUNK_SEGMENTS = 30;

type ProgressiveTranscodeWindow = {
  startSegment?: number;
  segmentCount?: number;
};

function finitePositive(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * Present a compatibility transcode as finite VOD from its first manifest.
 * Segments are produced lazily by the transcode manager, including after a
 * seek, so clients never have to treat an already-known movie as live media.
 */
export function buildProgressiveVodPlaylist(
  sessionId: string,
  durationSeconds: number,
): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(sessionId)) {
    throw new Error("Invalid transcode session ID.");
  }
  if (!finitePositive(durationSeconds)) {
    throw new Error("A positive VOD duration is required.");
  }

  const segmentCount = Math.ceil(durationSeconds / TRANSCODE_HLS_SEGMENT_SECONDS);
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:6",
    `#EXT-X-TARGETDURATION:${TRANSCODE_HLS_SEGMENT_SECONDS}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const elapsed = segment * TRANSCODE_HLS_SEGMENT_SECONDS;
    const remaining = durationSeconds - elapsed;
    const segmentDuration = Math.min(TRANSCODE_HLS_SEGMENT_SECONDS, remaining);
    lines.push(
      `#EXTINF:${segmentDuration.toFixed(6)},`,
      `/api/stream/transcode/${sessionId}-${String(segment).padStart(6, "0")}.ts`,
    );
  }
  lines.push("#EXT-X-ENDLIST", "");
  return lines.join("\n");
}

/**
 * Convert browser-hostile progressive media (notably HEVC Main 10 in MKV) to
 * an event-style H.264/AAC HLS playlist that browsers and TV WebViews can
 * consume as complete, independently decodable segments.
 */
export function buildProgressiveTranscodeArgs(
  inputUrl: string,
  internalHeaders: string,
  playlistPath: string,
  segmentPattern: string,
  window?: ProgressiveTranscodeWindow,
): string[] {
  const startSegment = Math.max(0, Math.floor(window?.startSegment ?? 0));
  const segmentCount = Math.max(0, Math.floor(window?.segmentCount ?? 0));
  const startSeconds = startSegment * TRANSCODE_HLS_SEGMENT_SECONDS;
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-nostats",
    "-probesize",
    "32M",
    "-analyzeduration",
    "10M",
    "-fflags",
    "+genpts+discardcorrupt",
    "-rw_timeout",
    "180000000",
    "-user_agent",
    TRANSCODE_USER_AGENT,
    "-headers",
    internalHeaders,
  ];
  if (startSeconds > 0) {
    args.push("-ss", String(startSeconds));
  }
  args.push(
    "-i",
    inputUrl,
  );
  if (segmentCount > 0) {
    args.push("-t", String(segmentCount * TRANSCODE_HLS_SEGMENT_SECONDS));
  }
  args.push(
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-crf",
    "25",
    "-vf",
    "scale=w='min(1920,iw)':h=-2",
    "-maxrate",
    "10M",
    "-bufsize",
    "20M",
    "-pix_fmt",
    "yuv420p",
    "-sc_threshold",
    "0",
    "-force_key_frames",
    "expr:gte(t,n_forced*4)",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ac",
    "2",
    "-max_muxing_queue_size",
    "4096",
  );
  if (startSeconds > 0) {
    // Keep MPEG-TS timestamps aligned with the fragment's position in the
    // complete VOD playlist even though this encode begins at a seek window.
    args.push("-output_ts_offset", String(startSeconds));
  }
  args.push(
    "-f",
    "hls",
    "-hls_time",
    String(TRANSCODE_HLS_SEGMENT_SECONDS),
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "event",
    "-hls_flags",
    "independent_segments+temp_file",
  );
  if (startSegment > 0) {
    args.push("-start_number", String(startSegment));
  }
  args.push(
    "-hls_segment_filename",
    segmentPattern,
    playlistPath,
  );
  return args;
}
