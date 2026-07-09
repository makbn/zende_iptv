import "server-only";

import { prisma } from "@/lib/db/prisma";
import { invalidateTmdbConfigCache } from "@/lib/tmdb/tmdb-config";
import { invalidateWyzieConfigCache } from "@/lib/subtitles/wyzie-config";

const ROW_ID = 1;

export type SubtitleSettingsSnapshot = {
  wyzieApiKey: string | null;
  wyzieApiKeySource: "database" | "environment" | null;
  tmdbApiKey: string | null;
  tmdbApiKeySource: "database" | "environment" | null;
};

export type SubtitleSettingsPublic = {
  configured: boolean;
  wyzieApiKeyPreview: string | null;
  wyzieApiKeySource: "database" | "environment" | null;
  tmdbConfigured: boolean;
  tmdbApiKeyPreview: string | null;
  tmdbApiKeySource: "database" | "environment" | null;
  provider: "wyzie";
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

export async function loadSubtitleSettings(): Promise<SubtitleSettingsSnapshot> {
  let row:
    | {
        wyzieApiKey: string | null;
        tmdbApiKey: string | null;
      }
    | null = null;
  try {
    row = await prisma.subtitleSettings.findUnique({
      where: { id: ROW_ID },
      select: { wyzieApiKey: true, tmdbApiKey: true },
    });
  } catch {
    // Older DB schema on deployed host: fall back to env keys until migrations run.
    row = null;
  }

  const dbWyzieKey = trimOrNull(row?.wyzieApiKey);
  const envWyzieKey = trimOrNull(process.env.WYZIE_API_KEY);
  const wyzieApiKey = dbWyzieKey ?? envWyzieKey;
  const wyzieApiKeySource = dbWyzieKey ? "database" : envWyzieKey ? "environment" : null;

  const dbTmdbKey = trimOrNull(row?.tmdbApiKey);
  const envTmdbKey = trimOrNull(process.env.TMDB_API_KEY);
  const tmdbApiKey = dbTmdbKey ?? envTmdbKey;
  const tmdbApiKeySource = dbTmdbKey ? "database" : envTmdbKey ? "environment" : null;

  return { wyzieApiKey, wyzieApiKeySource, tmdbApiKey, tmdbApiKeySource };
}

export async function loadSubtitleSettingsPublic(): Promise<SubtitleSettingsPublic> {
  const settings = await loadSubtitleSettings();
  return {
    configured: Boolean(settings.wyzieApiKey),
    wyzieApiKeyPreview: maskApiKey(settings.wyzieApiKey),
    wyzieApiKeySource: settings.wyzieApiKeySource,
    tmdbConfigured: Boolean(settings.tmdbApiKey),
    tmdbApiKeyPreview: maskApiKey(settings.tmdbApiKey),
    tmdbApiKeySource: settings.tmdbApiKeySource,
    provider: "wyzie",
  };
}

export async function saveSubtitleSettings(patch: {
  wyzieApiKey?: string | null;
  tmdbApiKey?: string | null;
}): Promise<void> {
  const data: { wyzieApiKey?: string | null; tmdbApiKey?: string | null } = {};

  if ("wyzieApiKey" in patch) {
    data.wyzieApiKey = trimOrNull(patch.wyzieApiKey ?? undefined);
  }
  if ("tmdbApiKey" in patch) {
    data.tmdbApiKey = trimOrNull(patch.tmdbApiKey ?? undefined);
  }

  await prisma.subtitleSettings.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, ...data },
    update: data,
  });

  invalidateWyzieConfigCache();
  invalidateTmdbConfigCache();
}
