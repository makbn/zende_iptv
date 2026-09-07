import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { hashStreamUrl } from "@/lib/health/url-hash";
import { getProxyForChannel, ProxyNotReadyError } from "@/lib/proxies/proxy-store";
import { applyPublicCorsProxyUnwrap } from "@/lib/stream/public-cors-proxy-url";
import {
  inferPlaybackModeFromUrl,
  normalizeXtreamLivePlaybackUrl,
  progressivePlaybackExtension,
} from "@/lib/stream/playback-url";
import { createStreamSession } from "@/lib/stream/stream-session-store";
import {
  createStreamSessionGrant,
  setStreamSessionGrantCookie,
} from "@/lib/stream/stream-session-auth";
import type {
  MediaShareKind,
  MediaShareTarget,
  PublicMediaShare,
} from "@/lib/shares/media-share-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["play", "download"]),
  itemId: z.string().min(1).max(160),
});

function readPayload(raw: string): MediaShareTarget | null {
  try {
    const value = JSON.parse(raw) as MediaShareTarget;
    if (!value || !Array.isArray(value.items)) return null;
    return value;
  } catch {
    return null;
  }
}

async function loadShare(token: string) {
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return null;
  return prisma.mediaShare.findUnique({ where: { token } });
}

function expiredResponse(expiresAt: Date) {
  return NextResponse.json(
    {
      error: "This share link has expired.",
      expired: true,
      expiresAt: expiresAt.toISOString(),
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const share = await loadShare(token);
  if (!share) {
    return NextResponse.json(
      { error: "This share link does not exist." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (share.expiresAt.getTime() <= Date.now()) return expiredResponse(share.expiresAt);

  const payload = readPayload(share.payloadJson);
  if (!payload) {
    return NextResponse.json(
      { error: "This share link is unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body: PublicMediaShare = {
    kind: share.kind as MediaShareKind,
    title: share.title,
    logo: share.logo,
    group: payload.group?.trim() || null,
    description: payload.description?.trim() || null,
    expiresAt: share.expiresAt.toISOString(),
    items: payload.items.map((item) => ({
      id: item.id,
      title: item.title,
      ...(item.subtitle ? { subtitle: item.subtitle } : {}),
      ...(item.playback?.durationSeconds
        ? { durationSeconds: item.playback.durationSeconds }
        : {}),
    })),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const share = await loadShare(token);
  if (!share) {
    return NextResponse.json({ error: "This share link does not exist." }, { status: 404 });
  }
  if (share.expiresAt.getTime() <= Date.now()) return expiredResponse(share.expiresAt);

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid playback request." }, { status: 400 });
  }
  if (parsed.data.action === "download" && share.kind === "live") {
    return NextResponse.json({ error: "Live streams cannot be downloaded." }, { status: 400 });
  }

  const payload = readPayload(share.payloadJson);
  const item = payload?.items.find((candidate) => candidate.id === parsed.data.itemId);
  if (!item) {
    return NextResponse.json({ error: "Shared media was not found." }, { status: 404 });
  }

  const rawUrl = item.url.trim();
  const upstreamUrl = normalizeXtreamLivePlaybackUrl(
    applyPublicCorsProxyUnwrap(rawUrl, true),
  );
  try {
    const protocol = new URL(upstreamUrl).protocol;
    if (protocol !== "http:" && protocol !== "https:") throw new Error("protocol");
  } catch {
    return NextResponse.json({ error: "The shared stream URL is invalid." }, { status: 500 });
  }

  let proxyConfig;
  try {
    proxyConfig = await getProxyForChannel(await hashStreamUrl(rawUrl));
  } catch (error) {
    if (error instanceof ProxyNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not prepare the shared stream." }, { status: 500 });
  }

  const accessGrant = createStreamSessionGrant();
  const sessionId = await createStreamSession({
    accessGrant,
    upstreamRootUrl: upstreamUrl,
    title: item.title,
    logo: payload?.logo,
    group: payload?.group,
    meta: item.playback,
    proxyConfig: proxyConfig ?? undefined,
    absoluteExpiresAt: share.expiresAt,
  });

  if (parsed.data.action === "download") {
    const response = NextResponse.json({
      downloadUrl: `/api/stream/proxy/${encodeURIComponent(sessionId)}?download=1`,
    });
    setStreamSessionGrantCookie({
      response,
      request,
      sessionId,
      grant: accessGrant,
      expiresAt: share.expiresAt,
    });
    return response;
  }

  const mode = inferPlaybackModeFromUrl(upstreamUrl);
  const progressiveExtension = mode === "progressive"
    ? progressivePlaybackExtension(upstreamUrl)
    : "";
  const needsTranscode = mode === "progressive" && progressiveExtension === ".mkv";
  const extension = mode === "hls" ? ".m3u8" : mode === "mpegts" ? ".ts" : progressiveExtension;

  const response = NextResponse.json({
    playbackUrl: needsTranscode
      ? `/api/stream/transcode/${encodeURIComponent(sessionId)}.m3u8`
      : `/api/stream/proxy/${encodeURIComponent(sessionId)}${extension}`,
    playbackMode: needsTranscode ? "hls" : mode,
    transcoded: needsTranscode,
  });
  setStreamSessionGrantCookie({
    response,
    request,
    sessionId,
    grant: accessGrant,
    expiresAt: share.expiresAt,
  });
  return response;
}
