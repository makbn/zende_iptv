import "server-only";

import { loadSubtitleSettings } from "@/lib/subtitles/subtitle-settings-store";

const API_BASE = "https://sub.wyzie.io";

let cachedSettings: {
  data: Awaited<ReturnType<typeof loadSubtitleSettings>>;
  expiresAt: number;
} | null = null;

export function invalidateWyzieConfigCache(): void {
  cachedSettings = null;
}

async function getSettings() {
  if (cachedSettings && cachedSettings.expiresAt > Date.now()) {
    return cachedSettings.data;
  }
  const data = await loadSubtitleSettings();
  cachedSettings = { data, expiresAt: Date.now() + 30_000 };
  return data;
}

export async function wyzieConfigured(): Promise<boolean> {
  const settings = await getSettings();
  return Boolean(settings.wyzieApiKey);
}

export async function getWyzieApiKey(): Promise<string | null> {
  const settings = await getSettings();
  return settings.wyzieApiKey;
}

export function wyzieApiBase(): string {
  return API_BASE;
}
