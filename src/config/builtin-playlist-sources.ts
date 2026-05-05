/**
 * Built-in, allowlisted playlist sources. Only these preset IDs may be proxied
 * by the API — arbitrary URLs are rejected to avoid SSRF.
 *
 * @see https://github.com/iptv-org/iptv — collection of publicly listed IPTV links (CC0).
 * @see https://github.com/iptv-org/api — channel metadata API (separate from this file).
 */
export type BuiltinPlaylistSource = {
  readonly presetId: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly m3uUrl: string;
  readonly projectUrl: string;
  readonly attribution: string;
};

const IPTV_ORG_WORLD_INDEX: BuiltinPlaylistSource = {
  presetId: "iptv-org-world-index",
  label: "World channel index",
  shortDescription:
    "Full catalog from the iptv-org project (index.m3u). Streams are third-party; use only where you have rights.",
  m3uUrl: "https://iptv-org.github.io/iptv/index.m3u",
  projectUrl: "https://github.com/iptv-org/iptv",
  attribution: "iptv-org/iptv (CC0 playlist index; see project for legal notes)",
};

export const BUILTIN_PLAYLIST_SOURCES: readonly BuiltinPlaylistSource[] = [
  IPTV_ORG_WORLD_INDEX,
];

const BY_PRESET_ID = new Map(
  BUILTIN_PLAYLIST_SOURCES.map((s) => [s.presetId, s]),
);

export function getBuiltinPlaylistSource(
  presetId: string,
): BuiltinPlaylistSource | undefined {
  return BY_PRESET_ID.get(presetId);
}

export function isBuiltinPresetId(presetId: string): boolean {
  return BY_PRESET_ID.has(presetId);
}
