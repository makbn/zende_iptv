import "server-only";

import { createHash } from "node:crypto";
import type { IptvProvider, IptvProviderChannel } from "@prisma/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { prisma } from "@/lib/db/prisma";
import { buildXtreamSeriesContainerUrl, parseXtreamSeriesIdFromContainerUrl } from "@/lib/iptv/xtream-url";

export type ProviderInput = {
  name: string;
  kind: "xtream" | "m3u";
  serverUrl?: string;
  username?: string;
  password?: string;
  playlistUrl?: string;
  enabled?: boolean;
};

const externalKey = (channel: M3uChannel) =>
  createHash("sha256").update(channel.url.trim()).digest("hex");

type ProviderChannelRow = IptvProviderChannel & {
  provider: Pick<IptvProvider, "id" | "name">;
};

function providerChannelFromRow(row: ProviderChannelRow): M3uChannel {
  const rawSeriesId = row.contentType === "series" ? parseXtreamSeriesIdFromContainerUrl(row.url) : null;
  const scopedSeriesId = rawSeriesId ? `${row.provider.id}:${rawSeriesId}` : null;
  return {
    name: row.name,
    url: scopedSeriesId ? buildXtreamSeriesContainerUrl(scopedSeriesId) : row.url,
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
        url: channel.url,
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

export async function loadEnabledProviderChannels(): Promise<M3uChannel[]> {
  const rows = await prisma.iptvProviderChannel.findMany({
    where: { provider: { enabled: true } },
    include: { provider: { select: { id: true, name: true } } },
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
  const rows = await prisma.iptvProviderChannel.findMany({
    where: {
      url: { in: requested },
      provider: { enabled: true },
    },
    include: { provider: { select: { id: true, name: true } } },
  });
  const byStoredUrl = new Map(rows.map((row) => [row.url, providerChannelFromRow(row)]));
  return new Map(
    requested.flatMap((url) => {
      const channel = byStoredUrl.get(url);
      return channel ? [[url, channel] as const] : [];
    }),
  );
}
