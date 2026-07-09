import { NextResponse } from "next/server";
import { z } from "zod";

import { gateApiRequest } from "@/lib/auth/gate-api";
import {
  loadSubtitleSettingsPublic,
  saveSubtitleSettings,
} from "@/lib/subtitles/subtitle-settings-store";
import { tmdbConfigured } from "@/lib/tmdb/tmdb-config";
import { wyzieConfigured } from "@/lib/subtitles/wyzie-config";

export const runtime = "nodejs";

const patchSchema = z.object({
  wyzieApiKey: z.string().max(256).nullable().optional(),
  tmdbApiKey: z.string().max(256).nullable().optional(),
});

async function requireSubtitleSettingsEditor(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return { ok: false as const, response: gate.response };
  if (!gate.authEnabled) return { ok: true as const };
  if (gate.user.role !== "ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Administrator access is required to change subtitle settings." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const };
}

export async function GET(request: Request) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const settings = await loadSubtitleSettingsPublic();
  return NextResponse.json(settings);
}

export async function PATCH(request: Request) {
  const auth = await requireSubtitleSettingsEditor(request);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.wyzieApiKey === undefined && parsed.data.tmdbApiKey === undefined) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  await saveSubtitleSettings(parsed.data);
  const settings = await loadSubtitleSettingsPublic();
  return NextResponse.json({ ok: true, ...settings });
}
