export type IntegrationKind =
  | "plex"
  | "jellyfin"
  | "emby"
  | "generic_standards"
  | "other";

export type StoredIntegration = {
  id: string;
  kind: IntegrationKind;
  /** User-visible label */
  name: string;
  createdAt: number;
  updatedAt: number;
  /** e.g. https://plex.example.com:32400 */
  serverBaseUrl?: string;
  /** M3U or hosted playlist URL you want to reference */
  playlistUrl?: string;
  /** XMLTV / EPG URL */
  xmltvUrl?: string;
  notes?: string;
};
