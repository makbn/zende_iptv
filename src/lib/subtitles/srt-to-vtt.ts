/** Convert SubRip (.srt) to WebVTT for HTML5 `<track>` playback. */
export function srtToVtt(srt: string): string {
  const normalized = srt.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").trim();
  if (!normalized) return "WEBVTT\n\n";

  const blocks = normalized.split(/\n\n+/);
  const cues: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trimEnd());
    if (lines.length < 2) continue;

    let timeIndex = 0;
    if (/^\d+$/.test(lines[0] ?? "")) {
      timeIndex = 1;
    }

    const timing = lines[timeIndex];
    if (!timing?.includes("-->")) continue;

    const text = lines.slice(timeIndex + 1).join("\n").trim();
    if (!text) continue;

    const vttTiming = timing
      .replace(/,/g, ".")
      .replace(/\s+/g, " ")
      .trim();

    cues.push(`${vttTiming}\n${text}`);
  }

  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/** Best-effort format detection for subtitle payloads. */
export function subtitleTextToVtt(text: string, fileName?: string): string {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  const lowerName = fileName?.toLowerCase() ?? "";
  if (lowerName.endsWith(".vtt") || trimmed.startsWith("WEBVTT")) {
    return trimmed.startsWith("WEBVTT") ? trimmed : `WEBVTT\n\n${trimmed}`;
  }
  return srtToVtt(trimmed);
}
