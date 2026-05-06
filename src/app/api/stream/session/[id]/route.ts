import { NextResponse } from "next/server";

import { touchSession } from "@/lib/stream/stream-session-store";

export const runtime = "nodejs";

/** Metadata + canonical upstream URL for stats / ring matching (not shown in address bar). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await touchSession(id);
  if (!session) {
    return NextResponse.json({ error: "Unknown or expired session." }, { status: 404 });
  }

  return NextResponse.json({
    title: session.title,
    logo: session.logo ?? null,
    group: session.group ?? null,
    playbackUrl: `/api/stream/proxy/${id}`,
    canonicalUrl: session.upstreamRootUrl,
  });
}
