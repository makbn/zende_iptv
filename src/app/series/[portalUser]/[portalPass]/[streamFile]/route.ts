import { handlePortalMediaPlayback } from "@/lib/iptv/portal-media-playback";

export const runtime = "nodejs";

/** Xtream-style series-episode playback for Threadfin / portal clients. */
export async function GET(
  request: Request,
  context: {
    params: Promise<{ portalUser: string; portalPass: string; streamFile: string }>;
  },
) {
  const { portalUser, portalPass, streamFile } = await context.params;
  return handlePortalMediaPlayback(request, {
    portalUser,
    portalPass,
    streamFile,
    kind: "episode",
  });
}
