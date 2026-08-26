import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseEntries(raw) {
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function providerParts(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!["live", "movie", "series"].includes(parts[0]) || parts.length < 4) return null;
    return {
      serverUrl: `${parsed.protocol}//${parsed.host}`,
      username: decodeURIComponent(parts[1]),
      password: decodeURIComponent(parts[2]),
    };
  } catch {
    return null;
  }
}

const existingProviders = await prisma.iptvProvider.count();
if (existingProviders === 0) {
  const store = await prisma.manualChannelsStore.findUnique({ where: { id: 1 } });
  const entries = store ? parseEntries(store.entriesJson) : [];
  const groups = new Map();
  for (const entry of entries) {
    const channel = entry?.channel;
    if (!channel?.url || !channel?.name) continue;
    const parts = providerParts(channel.url);
    if (!parts) continue;
    const key = `${parts.serverUrl}\u0000${parts.username}\u0000${parts.password}`;
    const group = groups.get(key) ?? { ...parts, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  // Legacy series containers did not carry credentials in their zende:// URL.
  // When there is one discoverable Xtream source, preserve their provider link.
  if (groups.size === 1) {
    const soleGroup = groups.values().next().value;
    for (const entry of entries) {
      const channel = entry?.channel;
      if (channel?.contentType === "series" && channel.url?.startsWith("zende://series/")) {
        soleGroup.entries.push(entry);
      }
    }
  }

  let providerNumber = 0;
  const migratedIds = new Set();
  for (const group of groups.values()) {
    providerNumber += 1;
    const hostname = new URL(group.serverUrl).hostname;
    await prisma.$transaction(async (tx) => {
      const provider = await tx.iptvProvider.create({
        data: {
          name: `Imported provider ${providerNumber} · ${hostname}`,
          kind: "xtream",
          serverUrl: group.serverUrl,
          username: group.username,
          password: group.password,
        },
      });
      const unique = new Map();
      for (const entry of group.entries) {
        const channel = entry.channel;
        const hash = createHash("sha256").update(channel.url.trim()).digest("hex");
        unique.set(hash, { hash, channel, legacyId: entry.id });
      }
      await tx.iptvProviderChannel.createMany({
        data: [...unique.values()].map(({ hash, channel }) => ({
          providerId: provider.id,
          externalKey: hash,
          name: channel.name,
          url: channel.url,
          duration: Number.isFinite(channel.duration) ? Math.trunc(channel.duration) : -1,
          contentType: channel.contentType ?? null,
          tvgId: channel.tvgId ?? null,
          tvgLogo: channel.tvgLogo ?? null,
          tvgLanguage: channel.tvgLanguage ?? null,
          groupTitle: channel.groupTitle ?? null,
          description: channel.description ?? null,
          addedByUserId: group.entries.find((entry) => entry.channel?.url === channel.url)?.addedByUserId ?? null,
        })),
      });
      for (const { legacyId } of unique.values()) migratedIds.add(legacyId);
    }, { timeout: 300_000 });
  }

  if (store && migratedIds.size > 0) {
    const remaining = entries.filter((entry) => !migratedIds.has(entry?.id));
    if (remaining.length > 0) {
      const manualProvider = await prisma.iptvProvider.create({
        data: { name: "Manual & legacy streams", kind: "manual" },
      });
      const unique = new Map();
      for (const entry of remaining) {
        const channel = entry?.channel;
        if (!channel?.url || !channel?.name) continue;
        const hash = createHash("sha256").update(channel.url.trim()).digest("hex");
        unique.set(hash, { hash, entry, channel });
      }
      await prisma.iptvProviderChannel.createMany({
        data: [...unique.values()].map(({ hash, entry, channel }) => ({
          ...(typeof entry.id === "string" && entry.id ? { id: entry.id } : {}),
          providerId: manualProvider.id,
          externalKey: hash,
          name: channel.name,
          url: channel.url,
          duration: Number.isFinite(channel.duration) ? Math.trunc(channel.duration) : -1,
          contentType: channel.contentType ?? null,
          tvgId: channel.tvgId ?? null,
          tvgLogo: channel.tvgLogo ?? null,
          tvgLanguage: channel.tvgLanguage ?? null,
          groupTitle: channel.groupTitle ?? null,
          description: channel.description ?? null,
          addedByUserId: entry.addedByUserId ?? null,
        })),
      });
    }
    await prisma.manualChannelsStore.update({ where: { id: 1 }, data: { entriesJson: "[]" } });
  } else if (store && entries.length > 0 && groups.size === 0) {
    const manualProvider = await prisma.iptvProvider.create({
      data: { name: "Manual & legacy streams", kind: "manual" },
    });
    const unique = new Map();
    for (const entry of entries) {
      const channel = entry?.channel;
      if (!channel?.url || !channel?.name) continue;
      const hash = createHash("sha256").update(channel.url.trim()).digest("hex");
      unique.set(hash, { hash, entry, channel });
    }
    await prisma.iptvProviderChannel.createMany({
      data: [...unique.values()].map(({ hash, entry, channel }) => ({
        ...(typeof entry.id === "string" && entry.id ? { id: entry.id } : {}),
        providerId: manualProvider.id,
        externalKey: hash,
        name: channel.name,
        url: channel.url,
        duration: Number.isFinite(channel.duration) ? Math.trunc(channel.duration) : -1,
        contentType: channel.contentType ?? null,
        tvgId: channel.tvgId ?? null,
        tvgLogo: channel.tvgLogo ?? null,
        tvgLanguage: channel.tvgLanguage ?? null,
        groupTitle: channel.groupTitle ?? null,
        description: channel.description ?? null,
        addedByUserId: entry.addedByUserId ?? null,
      })),
    });
    await prisma.manualChannelsStore.update({ where: { id: 1 }, data: { entriesJson: "[]" } });
  }
}

await prisma.$disconnect();
