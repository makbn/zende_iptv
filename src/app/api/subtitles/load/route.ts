import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { wyzieConfigured } from "@/lib/subtitles/wyzie-config";
import { fetchWyzieSubtitlePayload } from "@/lib/subtitles/wyzie-client";
import { storeSubtitleVtt } from "@/lib/subtitles/subtitle-cache";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().url().max(2048),
  label: z.string().trim().min(1).max(256),
  language: z.string().trim().min(1).max(16),
  fileName: z.string().trim().max(256).optional(),
});

export async function POST(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  if (!(await wyzieConfigured())) {
    return NextResponse.json(
      {
        error:
          "Subtitle search is not configured. Add a Wyzie API key in Settings → Integrations.",
      },
      { status: 503 },
    );
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const payload = await fetchWyzieSubtitlePayload(parsed.data.url);
    const trackId = storeSubtitleVtt({
      label: parsed.data.label,
      language: parsed.data.language,
      text: payload.text,
      fileName: parsed.data.fileName ?? payload.fileName,
    });

    return NextResponse.json({
      trackId,
      label: parsed.data.label,
      language: parsed.data.language,
      vttUrl: `/api/subtitles/vtt/${trackId}`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Could not load subtitle.",
      },
      { status: 502 },
    );
  }
}
