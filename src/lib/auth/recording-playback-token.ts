import "server-only";

import { SignJWT, jwtVerify } from "jose";

import { getJwtSecretBytes } from "@/lib/auth/jwt-secret";

const TYP = "rec_play";

/** Long enough for a full movie; short enough to limit URL replay if leaked. */
const PLAYBACK_JWT_EXPIRY = "12h";

export async function signRecordingPlaybackToken(input: {
  userId: string;
  recordingId: string;
}): Promise<string> {
  const secret = getJwtSecretBytes();
  return new SignJWT({
    typ: TYP,
    rid: input.recordingId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(PLAYBACK_JWT_EXPIRY)
    .sign(secret);
}

export async function verifyRecordingPlaybackToken(
  token: string,
): Promise<{ userId: string; recordingId: string } | null> {
  try {
    const secret = getJwtSecretBytes();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (payload.typ !== TYP) return null;
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    const recordingId = typeof payload.rid === "string" ? payload.rid : null;
    if (!userId || !recordingId) return null;
    return { userId, recordingId };
  } catch {
    return null;
  }
}
