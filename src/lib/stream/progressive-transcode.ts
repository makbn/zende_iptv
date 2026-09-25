const TRANSCODE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const TRANSCODE_HLS_SEGMENT_SECONDS = 4;
export const TRANSCODE_HLS_CHUNK_SEGMENTS = 30;

type ProgressiveTranscodeWindow = {
  startSegment?: number;
  segmentCount?: number;
  /** Upstream audio stream index (`0:a:N`). Defaults to 0. */
  audioTrackIndex?: number;
  /**
   * When set, convert HDR (PQ/HLG/BT.2020) into Rec.709 SDR before H.264.
   * Leave unset/null for ordinary SDR so colors are not remapped.
   */
  hdrToneMapKind?: "pq" | "hlg" | "bt2020" | null;
};

/** Plain downscale for SDR sources — no color remapping. */
export const SDR_COMPAT_VF = "scale=w='min(1920,iw)':h=-2:flags=fast_bilinear";

/**
 * Realtime-safe HDR → Rec.709 for the compatibility transcoder.
 * Scale to ≤1080p first so 4K HDR never starves segment pacing, then a fast
 * colorspace convert. Note: stock FFmpeg `colorspace` has no PQ/HLG enums
 * (`smpte2084` / `arib-std-b67`) — those abort the filter graph — so we use
 * `bt2020-10` which this build accepts and keeps encodes realtime.
 */
export function buildHdrToneMapVf(kind: "pq" | "hlg" | "bt2020"): string {
  // HLG and PQ both land on BT.2020-family transfers that FFmpeg's colorspace
  // filter can parse. Kind is retained for logging / future libzimg builds.
  void kind;
  return [
    "scale=w='min(1920,iw)':h=-2:flags=fast_bilinear",
    "colorspace=all=bt709:space=bt709:trc=bt709:primaries=bt709:range=tv:ispace=bt2020nc:itrc=bt2020-10:iprimaries=bt2020:irange=tv:fast=1",
    "format=yuv420p",
  ].join(",");
}

/** @deprecated Kept for callers/tests that referenced the old zscale graph. */
export const HDR_TO_SDR_VF = buildHdrToneMapVf("pq");
export const HDR_TO_SDR_VF_ZSCALE = HDR_TO_SDR_VF;

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
  const audioTrackIndex = Math.max(0, Math.floor(window?.audioTrackIndex ?? 0));
  const hdrKind = window?.hdrToneMapKind ?? null;
  const startSeconds = startSegment * TRANSCODE_HLS_SEGMENT_SECONDS;
  const videoFilter = hdrKind ? buildHdrToneMapVf(hdrKind) : SDR_COMPAT_VF;
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
  args.push("-map", "0:v:0", `-map`, `0:a:${audioTrackIndex}?`, "-sn", "-dn");
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-tune",
    "zerolatency",
    "-profile:v",
    "main",
    "-level:v",
    "4.2",
    "-crf",
    "25",
    "-vf",
    videoFilter,
    "-maxrate",
    "10M",
    "-bufsize",
    "20M",
    "-pix_fmt",
    "yuv420p",
    // Tag Rec.709 limited so TV WebViews do not guess BT.601 / full-range.
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    "-color_range",
    "tv",
    // Do not let FFmpeg's automatic CFR mode manufacture duplicate frames
    // for variable- or fractional-rate movie sources.
    "-fps_mode:v",
    "passthrough",
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
