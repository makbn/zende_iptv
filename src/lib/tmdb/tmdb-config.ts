import "server-only";

import { loadSubtitleSettings } from "@/lib/subtitles/subtitle-settings-store";

const API_BASE = "https://api.themoviedb.org/3";

let cachedKey: { value: string | null; expiresAt: number } | null = null;

export function invalidateTmdbConfigCache(): void {
  cachedKey = null;
}

export async function tmdbConfigured(): Promise<boolean> {
  return Boolean(await getTmdbApiKey());
}

export async function getTmdbApiKey(): Promise<string | null> {
  if (cachedKey && cachedKey.expiresAt > Date.now()) {
    return cachedKey.value;
  }
  const settings = await loadSubtitleSettings();
  cachedKey = { value: settings.tmdbApiKey, expiresAt: Date.now() + 30_000 };
  return settings.tmdbApiKey;
}

export function tmdbApiBase(): string {
  return API_BASE;
}

export function tmdbPosterUrl(posterPath: string | null | undefined, width = "w92"): string | null {
  if (!posterPath?.trim()) return null;
  const path = posterPath.startsWith("/") ? posterPath : `/${posterPath}`;
  return `https://image.tmdb.org/t/p/${width}${path}`;
}

export function tmdbImageUrl(
  imagePath: string | null | undefined,
  width: "w185" | "w342" | "w500" | "w780" | "original" = "w500",
): string | null {
  if (!imagePath?.trim()) return null;
  const path = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  return `https://image.tmdb.org/t/p/${width}${path}`;
}
