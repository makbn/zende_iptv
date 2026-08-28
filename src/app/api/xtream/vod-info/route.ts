import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { prisma } from "@/lib/db/prisma";
import { fetchXtreamVodInfo } from "@/lib/iptv/xtream-client";
import { loadXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import type { XtreamVodInfo } from "@/lib/iptv/xtream-types";
import {
  buildXtreamMovieUrlFromVodInfo,
  parseXtreamCredentialsFromStreamUrl,
  parseXtreamVodIdFromStreamUrl,
} from "@/lib/iptv/xtream-url";
import { getCachedMediaMetadata } from "@/lib/media/media-metadata-service";
import { parseXtreamDurationSeconds } from "@/lib/playback/stream-session-meta";

export const runtime = "nodejs";

const querySchema = z.object({
  vodId: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  title: z.string().min(1).max(300).optional(),
});

function mergePortalInfo(vod: XtreamVodInfo | null): Record<string, unknown> {
  return { ...(vod?.movie_data ?? {}), ...(vod?.info ?? {}) };
}

/** Movie detail payload: provider playback data plus weekly DB-cached public metadata. */
export async function GET(request: Request) {
  return withApiLogging("api.xtream.vod-info", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      vodId: url.searchParams.get("vodId") ?? undefined,
      url: url.searchParams.get("url") ?? undefined,
      title: url.searchParams.get("title") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const requestedId = parsed.data.vodId?.trim() ?? "";
    const channelRowId = requestedId.startsWith("channel:")
      ? requestedId.slice("channel:".length).trim()
      : "";
    const providerChannel = channelRowId
      ? await prisma.iptvProviderChannel.findUnique({
          where: { id: channelRowId },
          include: { provider: true },
        })
      : null;
    if (channelRowId && !providerChannel) {
      return NextResponse.json({ error: "Movie was not found in the library." }, { status: 404 });
    }

    const scoped = !channelRowId ? /^([^:]+):(.+)$/.exec(requestedId) : null;
    const scopedProvider = scoped
      ? await prisma.iptvProvider.findUnique({ where: { id: scoped[1] } })
      : null;
    const provider = providerChannel?.provider ?? scopedProvider;
    let vodId = channelRowId
      ? parseXtreamVodIdFromStreamUrl(providerChannel!.url) ?? ""
      : scoped?.[2]?.trim() || requestedId;
    if (!vodId && parsed.data.url) {
      vodId = parseXtreamVodIdFromStreamUrl(parsed.data.url) ?? "";
    }
    if (!vodId && !providerChannel) {
      return NextResponse.json({ error: "vodId required" }, { status: 400 });
    }

    const providerCreds =
      provider?.serverUrl && provider.username && provider.password
        ? { serverUrl: provider.serverUrl, username: provider.username, password: provider.password }
        : null;
    const creds =
      providerCreds ??
      (providerChannel ? parseXtreamCredentialsFromStreamUrl(providerChannel.url) : null) ??
      (parsed.data.url ? parseXtreamCredentialsFromStreamUrl(parsed.data.url) : null) ??
      (await loadXtreamPortalCredentials());

    let vod: XtreamVodInfo | null = null;
    if (vodId && creds) {
      vod = await fetchXtreamVodInfo(creds, vodId);
      if (!vod && !providerChannel) {
        log.error("get_vod_info returned nothing", { vodId });
        return NextResponse.json({ error: "Could not load movie from portal." }, { status: 502 });
      }
      if (!vod) log.warn("movie portal metadata unavailable; using catalog fallback", { vodId });
    }

    const portalInfo = mergePortalInfo(vod);
    const providerTitle =
      (typeof portalInfo.name === "string" && portalInfo.name.trim()
        ? portalInfo.name.trim()
        : providerChannel?.name) ??
      parsed.data.title ??
      "Untitled movie";
    const parsedTitle = parseChannelLabel(providerTitle);
    const mediaKey = providerChannel
      ? `channel:${providerChannel.id}`
      : `movie:${requestedId || vodId}`;
    const metadata = await getCachedMediaMetadata({
      mediaKey,
      providerChannelId: providerChannel?.id,
      mediaType: "movie",
      title: parsedTitle.displayName,
      year: parsedTitle.yearLabel,
      portalInfo,
    }).catch((error) => {
      log.error("movie metadata cache failed", {
        mediaKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    const playUrl =
      providerChannel?.url ||
      (vod && creds ? buildXtreamMovieUrlFromVodInfo(creds, vod) : "") ||
      parsed.data.url ||
      "";
    if (!playUrl) {
      return NextResponse.json({ error: "Movie stream URL is unavailable." }, { status: 502 });
    }

    const durationSeconds = parseXtreamDurationSeconds(portalInfo);
    return NextResponse.json({
      vodId: vodId || requestedId,
      info: vod?.info ?? {},
      movieData: vod?.movie_data ?? null,
      durationSeconds: durationSeconds ?? null,
      metadata,
      channel: {
        name: metadata?.title ?? parsedTitle.displayName,
        url: playUrl,
        duration: -1,
        contentType: "movie" as const,
        ...(metadata?.posterUrl || providerChannel?.tvgLogo
          ? { tvgLogo: metadata?.posterUrl ?? providerChannel?.tvgLogo }
          : {}),
        ...(providerChannel?.groupTitle ? { groupTitle: providerChannel.groupTitle } : {}),
        ...(provider?.id ? { providerId: provider.id } : {}),
        ...(providerChannel?.id ? { providerChannelId: providerChannel.id } : {}),
      },
    });
  });
}
