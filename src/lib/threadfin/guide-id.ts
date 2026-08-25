import type { ThreadfinContentKind } from "@/lib/threadfin/catalog";

/** Stable, unique XMLTV/M3U id for Threadfin's selected Plex lineup. */
export function threadfinGuideId(
  kind: ThreadfinContentKind,
  streamId: number,
): string {
  return `zende-${kind}-${streamId}`;
}
