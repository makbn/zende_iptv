import "server-only";

import {
  clearEpgResponseCache,
  getEpgResponseCacheStats,
} from "@/lib/epg/epg-response-cache";
import {
  clearProviderXmltvCache,
  getProviderXmltvCacheStats,
} from "@/lib/epg/provider-xmltv-index";
import {
  clearImageCache,
  getImageCacheStats,
  type ImageCacheKind,
} from "@/lib/media/image-cache";
import {
  clearSharedRootPins,
  getSharedRootPinCacheStats,
} from "@/lib/stream/shared-root-pin-cache";
import {
  clearSharedStreamCache,
  getSharedStreamCacheStats,
} from "@/lib/stream/shared-response-cache";
import {
  clearSharedManifestCache,
  getSharedManifestCacheStats,
} from "@/lib/stream/shared-manifest-cache";
import {
  clearSubtitleCache,
  getSubtitleCacheStats,
} from "@/lib/subtitles/subtitle-cache";

export const CACHE_IDS = [
  "stream",
  "logos",
  "posters",
  "thumbnails",
  "subtitles",
  "epg",
] as const;

export type CacheId = (typeof CACHE_IDS)[number];

export type AdminCacheSnapshot = {
  id: CacheId;
  label: string;
  description: string;
  entries: number;
  bytes: number | null;
  inFlight: number;
  ttlMs: number;
  detail?: string;
};

const IMAGE_META: Record<ImageCacheKind, { id: CacheId; label: string; description: string }> = {
  logo: {
    id: "logos",
    label: "Channel logos",
    description: "Station and EPG icons relayed through this server.",
  },
  poster: {
    id: "posters",
    label: "Posters",
    description: "Movie and series portrait artwork.",
  },
  thumbnail: {
    id: "thumbnails",
    label: "Thumbnails & backdrops",
    description: "Hero art, landscape previews, and other remote images.",
  },
};

function imageSnapshot(kind: ImageCacheKind): AdminCacheSnapshot {
  const stats = getImageCacheStats(kind);
  const meta = IMAGE_META[kind];
  return {
    ...meta,
    entries: stats.entries,
    bytes: stats.bytes,
    inFlight: stats.inFlight,
    ttlMs: stats.ttlMs,
  };
}

export async function getAdminCacheSnapshots(): Promise<AdminCacheSnapshot[]> {
  const stream = getSharedStreamCacheStats();
  const manifests = getSharedManifestCacheStats();
  const pins = getSharedRootPinCacheStats();
  const subtitles = await getSubtitleCacheStats();
  const epg = getEpgResponseCacheStats();
  const xmltv = getProviderXmltvCacheStats();

  return [
    {
      id: "stream",
      label: "Live stream segments",
      description: "Short shared HLS segment cache used by simultaneous viewers.",
      entries: stream.entries + manifests.entries + pins.entries,
      bytes: stream.bytes,
      inFlight: stream.inFlight + manifests.inFlight,
      ttlMs: stream.ttlMs,
      detail: `${manifests.entries} shared manifest${manifests.entries === 1 ? "" : "s"}, ${pins.entries} pinned provider edge${pins.entries === 1 ? "" : "s"}`,
    },
    imageSnapshot("logo"),
    imageSnapshot("poster"),
    imageSnapshot("thumbnail"),
    {
      id: "subtitles",
      label: "Subtitles",
      description: "Downloaded VTT tracks and subtitle-search results stored on disk.",
      entries: subtitles.entries,
      bytes: subtitles.bytes,
      inFlight: 0,
      ttlMs: subtitles.ttlMs,
      detail: `${subtitles.memoryEntries} in memory`,
    },
    {
      id: "epg",
      label: "EPG guide data",
      description: "Merged guide responses and the provider XMLTV index.",
      entries: epg.entries + xmltv.entries,
      bytes: null,
      inFlight: epg.inFlight + xmltv.inFlight,
      ttlMs: Math.min(epg.ttlMs, xmltv.ttlMs),
      detail: `${epg.programmes + xmltv.programmes} programmes, provider refresh every 30 min`,
    },
  ];
}

export async function clearAdminCache(id: CacheId): Promise<void> {
  switch (id) {
    case "stream":
      clearSharedStreamCache();
      clearSharedManifestCache();
      clearSharedRootPins();
      return;
    case "logos":
      clearImageCache("logo");
      return;
    case "posters":
      clearImageCache("poster");
      return;
    case "thumbnails":
      clearImageCache("thumbnail");
      return;
    case "subtitles":
      await clearSubtitleCache();
      return;
    case "epg":
      clearEpgResponseCache();
      clearProviderXmltvCache();
  }
}
