import "server-only";

import { gateApiRequest } from "@/lib/auth/gate-api";

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
