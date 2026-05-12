import "server-only";

import { NextResponse } from "next/server";

import { gateApiRequest, getBearerToken } from "@/lib/auth/gate-api";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { verifyRecordingPlaybackToken } from "@/lib/auth/recording-playback-token";
import { prisma } from "@/lib/db/prisma";
import { ensureAuthConfigRow } from "@/lib/auth/auth-config";

/** Matches favorites / history when auth is disabled. */
export const RECORDING_GUEST_OWNER = "__guest__";

export async function resolveRecordingOwner(
  request: Request,
): Promise<string | Response> {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;
  if (gate.authEnabled) return gate.user.id;
  return RECORDING_GUEST_OWNER;
}

/**
 * Resolves the recording owner for **media** URLs (`<video src>`, Range requests) where the
 * browser does not send `Authorization`. When auth is on, accepts either a Bearer access token
 * **or** a short-lived `pt` query JWT minted by `/api/recordings/.../watch-meta`.
 */
export async function resolveRecordingOwnerForPlay(
  request: Request,
  recordingId: string,
): Promise<string | Response> {
  const cfg = await ensureAuthConfigRow();
  if (!cfg.enabled) {
    return RECORDING_GUEST_OWNER;
  }

  const bearer = getBearerToken(request);
  if (bearer) {
    const payload = await verifyAccessToken(bearer);
    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true },
      });
      if (user && user.username === payload.username) {
        return user.id;
      }
    }
  }

  let pt: string | null = null;
  try {
    pt = new URL(request.url).searchParams.get("pt");
  } catch {
    pt = null;
  }
  if (pt) {
    const v = await verifyRecordingPlaybackToken(pt);
    if (v && v.recordingId === recordingId) {
      return v.userId;
    }
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
