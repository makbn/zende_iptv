import "server-only";

import { createHash } from "node:crypto";
import type { StoredManualChannelEntry } from "@/lib/channels/manual-channels-policy";
import { normalizeManualChannel } from "@/lib/channels/manual-channels-policy";
import { invalidateXtreamCatalogCache } from "@/lib/iptv/aggregated-channels";
import { invalidateLibraryCatalogCache } from "@/lib/library/catalog";
import { prisma } from "@/lib/db/prisma";

const externalKey = (url: string) => createHash("sha256").update(url.trim()).digest("hex");

async function ensureManualProvider() {
  const existing = await prisma.iptvProvider.findFirst({
    where: { kind: "manual" },
    orderBy: { createdAt: "asc" },
  });
  return existing ?? prisma.iptvProvider.create({
    data: { name: "Manual streams", kind: "manual" },
  });
}

/** Compatibility facade: manual APIs now read relational provider-channel rows. */
export async function loadManualChannelRows(): Promise<StoredManualChannelEntry[]> {
  const rows = await prisma.iptvProviderChannel.findMany({
    where: { provider: { kind: "manual" } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    addedAt: row.createdAt.getTime(),
    ...(row.addedByUserId ? { addedByUserId: row.addedByUserId } : {}),
    channel: normalizeManualChannel({
      name: row.name,
      url: row.url,
      duration: row.duration,
      ...(row.contentType === "live" || row.contentType === "movie" || row.contentType === "series" ? { contentType: row.contentType } : {}),
      ...(row.tvgId ? { tvgId: row.tvgId } : {}),
      ...(row.tvgLogo ? { tvgLogo: row.tvgLogo } : {}),
      ...(row.tvgLanguage ? { tvgLanguage: row.tvgLanguage } : {}),
      ...(row.groupTitle ? { groupTitle: row.groupTitle } : {}),
      ...(row.description ? { description: row.description } : {}),
      providerId: row.providerId,
      providerChannelId: row.id,
    }),
  }));
}

/** Compatibility facade: replace the manual provider's relational channel rows. */
export async function saveManualChannelRows(rows: StoredManualChannelEntry[]): Promise<void> {
  const provider = await ensureManualProvider();
  await prisma.$transaction(async (tx) => {
    await tx.iptvProviderChannel.deleteMany({ where: { providerId: provider.id } });
    if (rows.length > 0) {
      await tx.iptvProviderChannel.createMany({
        data: rows.map((row) => {
          const channel = normalizeManualChannel(row.channel);
          return {
            id: row.id,
            providerId: provider.id,
            externalKey: externalKey(channel.url),
            name: channel.name,
            url: channel.url,
            duration: Math.trunc(channel.duration),
            contentType: channel.contentType ?? null,
            tvgId: channel.tvgId ?? null,
            tvgLogo: channel.tvgLogo ?? null,
            tvgLanguage: channel.tvgLanguage ?? null,
            groupTitle: channel.groupTitle ?? null,
            description: channel.description ?? null,
            addedByUserId: row.addedByUserId ?? null,
            createdAt: new Date(row.addedAt),
          };
        }),
      });
    }
  });
  invalidateXtreamCatalogCache();
  invalidateLibraryCatalogCache();
}
