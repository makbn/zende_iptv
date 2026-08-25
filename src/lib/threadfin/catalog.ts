import "server-only";

import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { isXtreamSeriesContainer, resolveLibraryContentType } from "@/lib/channels/content-type";
import { prisma } from "@/lib/db/prisma";
import { filterParentalChannels, loadParentalPolicy } from "@/lib/parental/parental-control-store";
import { stableThreadfinStreamId, threadfinMaxChannels } from "@/lib/threadfin/config";
import { createServerLogger } from "@/core/logging/server";

const log = createServerLogger("lib.threadfin.catalog");
const MANUAL_STORE_ID = 1;
const GUEST_USER_ID = "__guest__";
const CACHE_TTL_MS = 60_000;

export type ThreadfinContentKind = "live" | "movie" | "episode";

export type ThreadfinCatalogRow = {
  streamId: number;
  kind: ThreadfinContentKind;
  /** Upstream http(s) play URL. */
  playUrl: string;
  name: string;
  groupTitle: string;
  tvgId?: string;
  tvgLogo?: string;
};

export type ThreadfinCatalog = {
  rows: ThreadfinCatalogRow[];
  owner: { userId: string; username: string; isGuest: boolean };
  counts: {
    live: number;
    movie: number;
    episode: number;
    total: number;
    favoriteTotal: number;
    skippedUnplayable: number;
    capped: boolean;
    maxChannels: number;
  };
};

type CacheSlot = { t: number; data: ThreadfinCatalog };
let cache: CacheSlot | null = null;

export function invalidateThreadfinCatalogCache(): void {
  cache = null;
}

async function loadManualChannels(): Promise<M3uChannel[]> {
  const row = await prisma.manualChannelsStore.findUnique({ where: { id: MANUAL_STORE_ID } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.entriesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const channel =
        item && typeof item === "object" && "channel" in item
          ? (item as { channel?: M3uChannel }).channel
          : undefined;
      return channel?.name && typeof channel.url === "string" ? [channel] : [];
    });
  } catch {
    return [];
  }
}

async function loadAllChannels(): Promise<M3uChannel[]> {
  const channels: M3uChannel[] = [];
  for (const src of BUILTIN_PLAYLIST_SOURCES) {
    const row = await prisma.playlistCatalogCache.findUnique({ where: { presetId: src.presetId } });
    if (!row) continue;
    try {
      const parsed = JSON.parse(row.channelsJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const channel of parsed as M3uChannel[]) {
          if (channel?.name && typeof channel.url === "string") channels.push(channel);
        }
      }
    } catch {
      /* skip a corrupt cache entry */
    }
  }
  channels.push(...(await loadManualChannels()));
  return channels;
}

async function resolvePlexFavoritesOwner(): Promise<ThreadfinCatalog["owner"]> {
  const bootstrap = await prisma.user.findFirst({
    where: { isBootstrapAdmin: true },
    select: { id: true, username: true },
  });
  if (bootstrap) return { userId: bootstrap.id, username: bootstrap.username, isGuest: false };

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true },
  });
  if (admin) return { userId: admin.id, username: admin.username, isGuest: false };
  return { userId: GUEST_USER_ID, username: "Home profile", isGuest: true };
}

function isHttpPlayUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function rowFromChannel(channel: M3uChannel): ThreadfinCatalogRow | null {
  if (!isHttpPlayUrl(channel.url) || isXtreamSeriesContainer(channel)) return null;
  const resolved = resolveLibraryContentType(channel);
  const kind: ThreadfinContentKind =
    resolved === "movie" ? "movie" : resolved === "series" ? "episode" : "live";
  const playUrl = channel.url.trim();
  return {
    streamId: stableThreadfinStreamId(kind, playUrl),
    kind,
    playUrl,
    name: channel.name.trim() || "Favorite",
    groupTitle:
      channel.groupTitle?.trim() ||
      (kind === "live" ? "Live favorites" : kind === "movie" ? "Movie favorites" : "Show favorites"),
    tvgId: channel.tvgId?.trim() || undefined,
    tvgLogo: channel.tvgLogo?.trim() || undefined,
  };
}

/**
 * Global Plex lineup. Only the primary administrator's playable favorites are
 * advertised; global parental controls always apply and a browser session
 * unlock never changes this server-side export.
 */
export async function getThreadfinCatalog(): Promise<ThreadfinCatalog> {
  if (cache && Date.now() - cache.t < CACHE_TTL_MS) return cache.data;

  const maxChannels = threadfinMaxChannels();
  const owner = await resolvePlexFavoritesOwner();
  const favorites = await prisma.userFavorite.findMany({
    where: { userId: owner.userId },
    orderBy: [{ addedAt: "asc" }, { url: "asc" }],
    select: { url: true, name: true, tvgId: true, tvgLogo: true, groupTitle: true, addedAt: true },
  });
  const policy = await loadParentalPolicy();
  const allowedFavorites = filterParentalChannels(
    favorites,
    policy.enabled ? policy.hiddenPatterns : [],
  );
  const allChannels = await loadAllChannels();
  const channelByUrl = new Map(allChannels.map((channel) => [channel.url.trim(), channel]));
  const selected: ThreadfinCatalogRow[] = [];
  const seen = new Set<number>();
  let skippedUnplayable = favorites.length - allowedFavorites.length;

  for (const favorite of allowedFavorites) {
    const catalogChannel = channelByUrl.get(favorite.url.trim());
    const channel: M3uChannel = catalogChannel
      ? {
          ...catalogChannel,
          ...(favorite.tvgId?.trim() && !catalogChannel.tvgId?.trim()
            ? { tvgId: favorite.tvgId.trim() }
            : {}),
        }
      : {
          url: favorite.url,
          name: favorite.name,
          duration: -1,
          tvgId: favorite.tvgId ?? undefined,
          tvgLogo: favorite.tvgLogo ?? undefined,
          groupTitle: favorite.groupTitle ?? undefined,
        };
    const row = rowFromChannel(channel);
    if (!row || seen.has(row.streamId)) {
      skippedUnplayable += 1;
      continue;
    }
    seen.add(row.streamId);
    selected.push(row);
  }

  const rows = selected.slice(0, maxChannels);
  const counts = {
    live: rows.filter((row) => row.kind === "live").length,
    movie: rows.filter((row) => row.kind === "movie").length,
    episode: rows.filter((row) => row.kind === "episode").length,
    total: rows.length,
    favoriteTotal: favorites.length,
    skippedUnplayable,
    capped: selected.length > maxChannels,
    maxChannels,
  };
  const data: ThreadfinCatalog = { rows, owner, counts };
  cache = { t: Date.now(), data };
  log.info("threadfin favorites catalog built", { ...counts, owner: owner.username });
  return data;
}

export async function findThreadfinRow(
  kind: ThreadfinContentKind,
  streamId: number,
): Promise<ThreadfinCatalogRow | null> {
  const { rows } = await getThreadfinCatalog();
  return rows.find((row) => row.kind === kind && row.streamId === streamId) ?? null;
}
