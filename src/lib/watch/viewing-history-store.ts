import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  parsePlaybackSessionMeta,
  serializePlaybackSessionMeta,
  type PlaybackSessionMeta,
} from "@/lib/playback/stream-session-meta";
import { viewingContentKey } from "@/lib/watch/viewing-content-key";

export type ViewingHistoryInput = {
  url: string;
  name: string;
  tvgLogo?: string | null;
  groupTitle?: string | null;
  playback?: PlaybackSessionMeta;
  positionSeconds?: number;
};

type StoredIdentityRow = {
  id: string;
  url: string;
  name: string;
  contentKey: string | null;
  playbackJson: string | null;
  lastOpenedAt: Date;
};

export function storedViewingContentKey(
  row: Pick<StoredIdentityRow, "url" | "name" | "contentKey" | "playbackJson">,
): string {
  if (row.contentKey?.trim()) return row.contentKey;
  return viewingContentKey({
    url: row.url,
    name: row.name,
    playback: parsePlaybackSessionMeta(row.playbackJson),
  });
}

export async function saveViewingHistoryEntry(
  userId: string,
  input: ViewingHistoryInput,
  options?: {
    incrementOpenCount?: boolean;
    /** New VOD rows are not created until this playback position is reached. */
    minimumPositionSeconds?: number;
  },
): Promise<{ stored: boolean; contentKey: string }> {
  const contentKey = viewingContentKey(input);
  const roundedPosition =
    typeof input.positionSeconds === "number" &&
    Number.isFinite(input.positionSeconds) &&
    input.positionSeconds >= 0
      ? Math.round(input.positionSeconds)
      : undefined;

  const stored = await prisma.$transaction(async (tx) => {
    const rows = await tx.userViewingHistory.findMany({
      where: { userId },
      select: {
        id: true,
        url: true,
        name: true,
        contentKey: true,
        playbackJson: true,
        lastOpenedAt: true,
      },
    });
    const matches = rows
      .filter(
        (row) =>
          row.url === input.url || storedViewingContentKey(row) === contentKey,
      )
      .sort((a, b) => b.lastOpenedAt.getTime() - a.lastOpenedAt.getTime());
    const target = matches[0];

    if (
      !target &&
      roundedPosition != null &&
      roundedPosition < (options?.minimumPositionSeconds ?? 0)
    ) {
      return false;
    }

    if (matches.length > 1) {
      await tx.userViewingHistory.deleteMany({
        where: { id: { in: matches.slice(1).map((row) => row.id) } },
      });
    }

    const data = {
      url: input.url,
      contentKey,
      name: input.name.trim() || "Live",
      tvgLogo: input.tvgLogo?.trim() || null,
      groupTitle: input.groupTitle?.trim() || null,
      playbackJson: input.playback
        ? serializePlaybackSessionMeta(input.playback)
        : null,
      ...(roundedPosition != null ? { positionSeconds: roundedPosition } : {}),
      lastOpenedAt: new Date(),
    };

    if (target) {
      await tx.userViewingHistory.update({
        where: { id: target.id },
        data: {
          ...data,
          ...(options?.incrementOpenCount
            ? { openCount: { increment: 1 } }
            : {}),
        },
      });
    } else {
      await tx.userViewingHistory.create({
        data: {
          userId,
          ...data,
          openCount: 1,
        },
      });
    }
    return true;
  });

  return { stored, contentKey };
}

export async function pruneViewingHistory(
  userId: string,
  maximumEntries: number,
): Promise<void> {
  const oldest = await prisma.userViewingHistory.findMany({
    where: { userId },
    orderBy: { lastOpenedAt: "desc" },
    skip: maximumEntries,
    select: { id: true },
  });
  if (oldest.length === 0) return;
  await prisma.userViewingHistory.deleteMany({
    where: { id: { in: oldest.map((row) => row.id) } },
  });
}

export async function findViewingPositionForUrl(
  userId: string,
  url: string,
): Promise<number | null> {
  const row = await prisma.userViewingHistory.findUnique({
    where: { userId_url: { userId, url } },
    select: { positionSeconds: true },
  });
  return row?.positionSeconds ?? null;
}
