import { NextResponse } from "next/server";

import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { lookupChannelsByUrls } from "@/lib/library/catalog";
import { prisma } from "@/lib/db/prisma";
import {
  filterParentalChannels,
  isChannelParentalBlocked,
  resolveParentalAccess,
} from "@/lib/parental/parental-control-store";
import { invalidateThreadfinCatalogCache } from "@/lib/threadfin/catalog";
import { scheduleThreadfinSync } from "@/lib/threadfin/sync";

export const runtime = "nodejs";

/** Sentinel userId used when auth is disabled (single-user / home mode). */
const GUEST_USER_ID = "__guest__";

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
  const enrich = searchParams.get("enrich") === "1";

  let rows = await prisma.userFavorite.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
    select: {
      url: true,
      name: true,
      tvgId: true,
      tvgLogo: true,
      groupTitle: true,
      addedAt: true,
    },
  });
  rows = filterParentalChannels(rows, parental.blockedPatterns);

  if (!enrich) {
    return NextResponse.json(rows);
  }

  const presetId = BUILTIN_PLAYLIST_SOURCES[0]?.presetId;
  const catalogByUrl =
    presetId != null
      ? await lookupChannelsByUrls(
          presetId,
          rows.map((r) => r.url),
        )
      : new Map();

  return NextResponse.json(
    rows.map((row) => {
      const live = catalogByUrl.get(row.url);
      const channel = live
        ? {
            ...live,
            ...(row.tvgId?.trim() && !live.tvgId?.trim()
              ? { tvgId: row.tvgId.trim() }
              : {}),
          }
        : {
            url: row.url,
            name: row.name,
            duration: -1,
            ...(row.tvgId?.trim() ? { tvgId: row.tvgId.trim() } : {}),
            ...(row.tvgLogo ? { tvgLogo: row.tvgLogo } : {}),
            ...(row.groupTitle ? { groupTitle: row.groupTitle } : {}),
          };
      return { ...row, channel };
    }),
  );
}

export async function POST(request: Request) {
  const context = await resolveUserContext(request);
  if (context instanceof Response) return context;
  const { userId, gate } = context;

  let body: {
    url?: string;
    name?: string;
    tvgId?: string;
    tvgLogo?: string;
    groupTitle?: string;
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

  await prisma.userFavorite.upsert({
    where: { userId_url: { userId, url: body.url } },
    create: {
      userId,
      url: body.url,
      name: (body.name ?? "").trim() || "Channel",
      tvgId: body.tvgId?.trim() ? body.tvgId.trim() : null,
      tvgLogo: body.tvgLogo ?? null,
      groupTitle: body.groupTitle ?? null,
    },
    update: {
      name: (body.name ?? "").trim() || "Channel",
      ...(body.tvgId !== undefined
        ? { tvgId: body.tvgId.trim() ? body.tvgId.trim() : null }
        : {}),
      tvgLogo: body.tvgLogo ?? null,
      groupTitle: body.groupTitle ?? null,
    },
  });

  invalidateThreadfinCatalogCache();
  scheduleThreadfinSync();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await resolveUserContext(request);
  if (context instanceof Response) return context;
  const { userId } = context;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("all") === "1") {
    await prisma.userFavorite.deleteMany({ where: { userId } });
    invalidateThreadfinCatalogCache();
    scheduleThreadfinSync();
    return NextResponse.json({ ok: true });
  }

  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  await prisma.userFavorite.deleteMany({ where: { userId, url } });
  invalidateThreadfinCatalogCache();
  scheduleThreadfinSync();

  return NextResponse.json({ ok: true });
}
