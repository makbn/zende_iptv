import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import {
  filterParentalChannels,
  isChannelParentalBlocked,
  resolveParentalAccess,
} from "@/lib/parental/parental-control-store";
import {
  pruneViewingHistory,
  saveViewingHistoryEntry,
  storedViewingContentKey,
} from "@/lib/watch/viewing-history-store";

export const runtime = "nodejs";

const GUEST_USER_ID = "__guest__";
const MAX_HISTORY = 200;

async function resolveUserContext(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  return { userId: gate.authEnabled ? gate.user.id : GUEST_USER_ID, gate };
}

export async function GET(request: Request) {
  const context = await resolveUserContext(request);
  if (context instanceof Response) return context;
  const { userId, gate } = context;
  const parental = await resolveParentalAccess(request, gate);

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") ?? "recent";

  let rows = await prisma.userViewingHistory.findMany({
    where: { userId },
    orderBy:
      sort === "count"
        ? [{ openCount: "desc" }, { lastOpenedAt: "desc" }]
        : { lastOpenedAt: "desc" },
    take: MAX_HISTORY,
    select: {
      id: true,
      url: true,
      contentKey: true,
      name: true,
      tvgLogo: true,
      groupTitle: true,
      playbackJson: true,
      positionSeconds: true,
      lastOpenedAt: true,
      openCount: true,
    },
  });
  rows = filterParentalChannels(rows, parental.blockedPatterns);

  // Legacy rows were URL-scoped, so one series could have one row per episode.
  // Collapse them at read time as well as during the next progress update.
  const seen = new Set<string>();
  rows = rows.filter((row) => {
    const key = storedViewingContentKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json(rows.map((row) => ({
    url: row.url,
    contentKey: storedViewingContentKey(row),
    name: row.name,
    tvgLogo: row.tvgLogo,
    groupTitle: row.groupTitle,
    playbackJson: row.playbackJson,
    positionSeconds: row.positionSeconds,
    lastOpenedAt: row.lastOpenedAt,
    openCount: row.openCount,
  })));
}

export async function POST(request: Request) {
  const context = await resolveUserContext(request);
  if (context instanceof Response) return context;
  const { userId, gate } = context;

  let body: {
    url?: string;
    name?: string;
    tvgLogo?: string;
    groupTitle?: string;
    playback?: unknown;
    positionSeconds?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  const parental = await resolveParentalAccess(request, gate);
  if (
    isChannelParentalBlocked(
      { name: body.name ?? "", groupTitle: body.groupTitle },
      parental.blockedPatterns,
    )
  ) {
    return NextResponse.json({ error: "Channel is locked by parental controls." }, { status: 403 });
  }

  await saveViewingHistoryEntry(userId, {
    url: body.url,
    name: (body.name ?? "").trim() || "Live",
    tvgLogo: body.tvgLogo,
    groupTitle: body.groupTitle,
    playback:
      body.playback && typeof body.playback === "object"
        ? (body.playback as PlaybackSessionMeta)
        : undefined,
    positionSeconds: body.positionSeconds,
  }, {
    incrementOpenCount: true,
  });

  await pruneViewingHistory(userId, MAX_HISTORY);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await resolveUserContext(request);
  if (context instanceof Response) return context;
  const { userId } = context;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("all") === "1") {
    await prisma.userViewingHistory.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true });
  }

  const url = searchParams.get("url");
  const contentKey = searchParams.get("contentKey");
  if (!url && !contentKey) {
    return NextResponse.json({ error: "url or contentKey required" }, { status: 400 });
  }

  if (contentKey) {
    const rows = await prisma.userViewingHistory.findMany({
      where: { userId },
      select: {
        id: true,
        url: true,
        name: true,
        contentKey: true,
        playbackJson: true,
      },
    });
    await prisma.userViewingHistory.deleteMany({
      where: {
        id: {
          in: rows
            .filter((row) => storedViewingContentKey(row) === contentKey)
            .map((row) => row.id),
        },
      },
    });
  } else {
    await prisma.userViewingHistory.deleteMany({ where: { userId, url: url! } });
  }

  return NextResponse.json({ ok: true });
}
