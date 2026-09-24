import type { PlaybackAudioTrack } from "@/lib/playback/stream-session-meta";

const MULTI_LANG_RE =
  /multi[\s_-]?lang|multi[\s_-]?audio|dual[\s_-]?audio|multi[\s_-]?lingual|\bmulti\b/i;

/** True when the catalog group advertises multiple audio languages. */
export function isMultiLangCatalogHint(group?: string | null, title?: string | null): boolean {
  const haystack = `${group ?? ""} ${title ?? ""}`;
  return MULTI_LANG_RE.test(haystack);
}

/**
 * Placeholder tracks so the player chrome can show the audio button when the
 * catalog marks MULTI-LANG but the container has not been probed yet.
 */
export function hintAudioTracksFromCatalog(
  group?: string | null,
  title?: string | null,
): PlaybackAudioTrack[] | undefined {
  if (!isMultiLangCatalogHint(group, title)) return undefined;
  return [
    { index: 0, label: "Audio track 1" },
    { index: 1, label: "Audio track 2" },
  ];
}
