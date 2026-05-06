import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";

/** Load parsed catalog from server SQLite (survives browser data clears). */
export async function fetchPlaylistCatalogFromApi(presetId: string): Promise<{
  channels: M3uChannel[];
  updatedAt: number | null;
}> {
  const res = await zendeFetch(
    `/api/playlists/catalog/${encodeURIComponent(presetId)}`,
  );
  const body = (await res.json().catch(() => ({}))) as {
    channels?: M3uChannel[];
    updatedAt?: number | null;
  };
  if (!res.ok) return { channels: [], updatedAt: null };
  const channels = Array.isArray(body.channels) ? body.channels : [];
  const updatedAt =
    typeof body.updatedAt === "number" ? body.updatedAt : null;
  return { channels, updatedAt };
}

/** Re-download upstream M3U on the server and persist — preferred over client-side fetch + PUT. */
export async function refreshPlaylistCatalogOnServer(presetId: string): Promise<{
  channelCount: number;
  updatedAt: number;
}> {
  const res = await zendeFetch(
    `/api/playlists/catalog/${encodeURIComponent(presetId)}/refresh`,
    { method: "POST" },
  );
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    channelCount?: number;
    updatedAt?: number;
  };
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `HTTP ${res.status}`,
    );
  }
  return {
    channelCount:
      typeof body.channelCount === "number" ? body.channelCount : 0,
    updatedAt:
      typeof body.updatedAt === "number" ? body.updatedAt : Date.now(),
  };
}
