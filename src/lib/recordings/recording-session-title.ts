/**
 * Stream session `title` used only for the DVR ffmpeg relay (`prepareRecordingSource`).
 * The stream proxy detects this value to apply longer upstream timeouts, retries, and
 * no circuit-breaker (single ffmpeg client — breaker 502s kill the encode).
 */
export const DVR_RECORDING_SESSION_TITLE = "Recording" as const;
