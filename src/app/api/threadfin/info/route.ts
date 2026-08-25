import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";
import { getRequestOrigin } from "@/lib/http/request-origin";
import {
  THREADFIN_PORTAL_USERNAME,
  deriveThreadfinPortalPassword,
  isThreadfinSyncEnabled,
  threadfinInternalUrl,
  threadfinPublicBaseUrl,
  threadfinPublicHost,
  threadfinPublicPort,
  threadfinTunerCount,
} from "@/lib/threadfin/config";
import { getThreadfinCatalog } from "@/lib/threadfin/catalog";
import { ensureThreadfinPortalCredential } from "@/lib/threadfin/sync";

export const runtime = "nodejs";

/** Admin UI payload for Threadfin / Plex DVR setup. */
export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (gate.authEnabled && gate.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const enabled = isThreadfinSyncEnabled();
  await ensureThreadfinPortalCredential();

  const state = await prisma.threadfinSyncState.findUnique({ where: { id: 1 } });
  const catalog = await getThreadfinCatalog();
  const portalUsername = state?.portalUsername || THREADFIN_PORTAL_USERNAME;
  const portalPassword = deriveThreadfinPortalPassword();

  const origin = getRequestOrigin(request);
  let publicHost = threadfinPublicHost();
  if (!publicHost) {
    try {
      publicHost = new URL(origin).hostname;
    } catch {
      publicHost = "localhost";
    }
  }
  const publicPort = threadfinPublicPort();
  const configuredBaseUrl = threadfinPublicBaseUrl();
  const dvrAddress = configuredBaseUrl || `${publicHost}:${publicPort}`;
  const webUi = configuredBaseUrl || `http://${publicHost}:${publicPort}`;

  const q = `username=${encodeURIComponent(portalUsername)}&password=${encodeURIComponent(portalPassword)}`;
  const sourcePlaylist = `${origin}/api/threadfin/playlist.m3u?${q}`;
  const sourceEpg = `${origin}/api/threadfin/epg.xml?${q}`;

  // Always show the current favorites selection. lastCountsJson is retained as
  // sync history only; using it here made Settings advertise stale channels
  // after a favorite was removed while Threadfin was still refreshing.
  const counts = catalog.counts;

  return NextResponse.json({
    enabled,
    syncConfigured: enabled,
    dvrAddress,
    discoverUrl: `${webUi}/discover.json`,
    webUiUrl: `${webUi}/web`,
    publicHost,
    publicPort,
    tunerCount: threadfinTunerCount(),
    threadfinInternalUrl: threadfinInternalUrl(),
    threadfinM3uUrl: `${webUi}/m3u/threadfin.m3u`,
    threadfinXmltvUrl: `${webUi}/xmltv/threadfin.xml`,
    sourcePlaylistUrl: sourcePlaylist,
    sourceEpgUrl: sourceEpg,
    portalUsername,
    portalPassword,
    lineupMode: "primary-admin-favorites",
    lineupOwner: catalog.owner,
    counts,
    lastSyncAt: state?.lastSyncAt?.toISOString() ?? null,
    lastSyncOk: state?.lastSyncOk ?? false,
    lastSyncError: state?.lastSyncError ?? null,
  });
}
