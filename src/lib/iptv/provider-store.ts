import "server-only";

import { createHash } from "node:crypto";
import type { IptvProvider, IptvProviderChannel } from "@prisma/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { prisma } from "@/lib/db/prisma";
import {
  activeXtreamServerUrl,
  buildXtreamSeriesContainerUrl,
  parseXtreamSeriesIdFromContainerUrl,
  resolveXtreamPlayUrl,
  toXtreamStoragePath,
  toXtreamStorageUrl,
  xtreamPathSegments,
} from "@/lib/iptv/xtream-url";

export type ProviderInput = {
  name: string;
  kind: "xtream" | "m3u";
  serverUrl?: string;
  backupServerUrl?: string;
  useBackupServer?: boolean;
  username?: string;
  password?: string;
  playlistUrl?: string;
  enabled?: boolean;
};

function providerPortalHosts(provider: {
  serverUrl?: string | null;
  backupServerUrl?: string | null;
}): Array<string | null | undefined> {
  return [provider.serverUrl, provider.backupServerUrl];
}

const externalKey = (channel: M3uChannel) =>
  createHash("sha256").update(toXtreamStoragePath(channel.url).trim()).digest("hex");

type ProviderChannelRow = IptvProviderChannel & {
  provider: Pick<
    IptvProvider,
    "id" | "name" | "kind" | "serverUrl" | "backupServerUrl" | "useBackupServer"
  >;
  mediaMetadata?: {
    imdbRating: number | null;
    imdbVotes: number | null;
  } | null;
};

function resolveStoredChannelUrl(row: ProviderChannelRow): string {
  const rawSeriesId =
    row.contentType === "series" ? parseXtreamSeriesIdFromContainerUrl(row.url) : null;
  if (rawSeriesId) {
    return buildXtreamSeriesContainerUrl(`${row.provider.id}:${rawSeriesId}`);
  }
  const host = activeXtreamServerUrl(row.provider);
  if (host && xtreamPathSegments(row.url)) {
    return resolveXtreamPlayUrl(host, row.url, providerPortalHosts(row.provider));
  }
  return row.url;
}

function providerChannelFromRow(row: ProviderChannelRow): M3uChannel {
  const rawSeriesId =
    row.contentType === "series" ? parseXtreamSeriesIdFromContainerUrl(row.url) : null;
  const scopedSeriesId = rawSeriesId ? `${row.provider.id}:${rawSeriesId}` : null;
  return {
    name: row.name,
    url: resolveStoredChannelUrl(row),
    duration: row.duration,
    ...(row.contentType === "live" || row.contentType === "movie" || row.contentType === "series"
      ? { contentType: row.contentType }
      : {}),
    ...(scopedSeriesId
      ? { tvgId: `xtream-series:${scopedSeriesId}` }
      : row.tvgId
        ? { tvgId: row.tvgId }
        : {}),
    ...(row.tvgLogo ? { tvgLogo: row.tvgLogo } : {}),
    ...(row.tvgLanguage ? { tvgLanguage: row.tvgLanguage } : {}),
    ...(row.groupTitle ? { groupTitle: row.groupTitle } : {}),
    ...(row.description ? { description: row.description } : {}),
    providerId: row.provider.id,
    providerName: row.provider.name,
    providerChannelId: row.id,
    ...(row.mediaMetadata?.imdbRating != null
      ? { imdbRating: row.mediaMetadata.imdbRating }
      : {}),
    ...(row.mediaMetadata?.imdbVotes != null
      ? { imdbVotes: row.mediaMetadata.imdbVotes }
      : {}),
  };
}

export async function createProviderWithChannels(input: ProviderInput, channels: M3uChannel[]) {
  const uniqueChannels = [...new Map(channels.map((channel) => [externalKey(channel), channel])).values()];
  const provider = await prisma.$transaction(async (tx) => {
    const created = await tx.iptvProvider.create({
      data: {
        name: input.name.trim(),
        kind: input.kind,
        serverUrl: input.serverUrl?.trim() || null,
        backupServerUrl: input.backupServerUrl?.trim() || null,
        useBackupServer: input.useBackupServer === true,
        username: input.username?.trim() || null,
        password: input.password || null,
        playlistUrl: input.playlistUrl?.trim() || null,
        enabled: input.enabled !== false,
      },
    });
    await tx.iptvProviderChannel.createMany({
      data: uniqueChannels.map((channel) => ({
        providerId: created.id,
        externalKey: externalKey(channel),
        name: channel.name,
        url: toXtreamStorageUrl(channel.url, [
          input.serverUrl,
          input.backupServerUrl,
        ]),
        duration: Number.isFinite(channel.duration) ? Math.trunc(channel.duration) : -1,
        contentType: channel.contentType ?? null,
        tvgId: channel.tvgId ?? null,
        tvgLogo: channel.tvgLogo ?? null,
        tvgLanguage: channel.tvgLanguage ?? null,
        groupTitle: channel.groupTitle ?? null,
        description: channel.description ?? null,
        addedByUserId: null,
      })),
    });
    return created;
  });
  return provider;
}

const providerSelect = {
  id: true,
  name: true,
  kind: true,
  serverUrl: true,
  backupServerUrl: true,
  useBackupServer: true,
} as const;

export async function loadEnabledProviderChannels(): Promise<M3uChannel[]> {
  const rows = await prisma.iptvProviderChannel.findMany({
    where: { provider: { enabled: true } },
    include: {
      provider: { select: providerSelect },
      mediaMetadata: { select: { imdbRating: true, imdbVotes: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map(providerChannelFromRow);
}

/** Enrich a small URL set directly from enabled provider rows without loading a catalog. */
export async function lookupEnabledProviderChannelsByUrls(
  urls: string[],
): Promise<Map<string, M3uChannel>> {
  const requested = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  if (requested.length === 0) return new Map();
  const paths = [
    ...new Set(
      requested
        .map((url) => toXtreamStoragePath(url))
        .filter((path) => path.startsWith("/live/") || path.startsWith("/movie/") || path.startsWith("/series/")),
    ),
  ];
  const exactCandidates = [...new Set([...requested, ...paths])];
  const rows = await prisma.iptvProviderChannel.findMany({
    where: {
      provider: { enabled: true },
      OR: [
        { url: { in: exactCandidates } },
        ...paths.map((path) => ({ url: { endsWith: path } })),
      ],
    },
    include: { provider: { select: providerSelect } },
  });
  const byStorageKey = new Map<string, M3uChannel>();
  for (const row of rows) {
    const channel = providerChannelFromRow(row);
    byStorageKey.set(row.url, channel);
    byStorageKey.set(toXtreamStoragePath(row.url), channel);
  }
  return new Map(
    requested.flatMap((url) => {
      const channel =
        byStorageKey.get(url) ?? byStorageKey.get(toXtreamStoragePath(url));
      return channel ? [[url, channel] as const] : [];
    }),
  );
}
