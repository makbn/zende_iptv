"use client";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";

import { isAllowedManualStreamUrl } from "@/lib/channels/manual-stream-url";

let hydrateOnce: Promise<void> | null = null;
/** Server-side manual row count — never load 100k+ rows into the browser. */
let cacheManualTotal = 0;
/** Small local cache for rows added/edited in this session (single-digit typical). */
let cacheEntries: ManualChannelEntry[] = [];

export type ManualChannelEntry = {
  id: string;
  channel: M3uChannel;
  addedAt: number;
  /** Set by the server after sync; who added/imported this row. */
  addedByUserId?: string;
};

async function refreshManualCountFromApi(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await zendeFetch("/api/channels/manual?mode=count");
    if (!res.ok) return;
    const data = (await res.json()) as { manualTotal?: number; total?: number };
    if (typeof data.manualTotal === "number") cacheManualTotal = data.manualTotal;
    else if (typeof data.total === "number") cacheManualTotal = data.total;
    notifyManualChannelsUpdated();
  } catch {
    /* ignore */
  }
}

/**
 * Load manual channel count from server once per session.
 * Full catalogs stay server-side; Library/Settings search uses paginated APIs.
 */
export async function hydrateManualChannelsFromApiOnce(): Promise<void> {
  if (hydrateOnce) return hydrateOnce;
  hydrateOnce = (async () => {
    try {
      await refreshManualCountFromApi();
    } catch {
      hydrateOnce = null;
    }
  })();
  return hydrateOnce;
}

/** Refresh server manual count after imports/edits (does not download the full catalog). */
export async function refreshManualChannelsFromApi(): Promise<void> {
  await refreshManualCountFromApi();
}

export { isAllowedManualStreamUrl };

export function getManualChannelCount(): number {
  return Math.max(cacheManualTotal, cacheEntries.length);
}

export function listManualChannelEntries(): ManualChannelEntry[] {
  return cacheEntries.slice().sort((a, b) => b.addedAt - a.addedAt);
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function manualChannelExists(url: string): boolean {
  const key = url.trim();
  return cacheEntries.some((e) => e.channel.url.trim() === key);
}

/** Insert or replace by URL via server POST (never replaces the whole server catalog). */
export async function upsertManualChannel(channel: M3uChannel): Promise<ManualChannelEntry | null> {
  const res = await zendeFetch("/api/channels/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) return null;
  const urlKey = channel.url.trim();
  const idx = cacheEntries.findIndex((e) => e.channel.url.trim() === urlKey);
  const row: ManualChannelEntry = {
    id: idx >= 0 ? cacheEntries[idx]!.id : newId(),
    channel,
    addedAt: Date.now(),
  };
  if (idx >= 0) cacheEntries[idx] = row;
  else cacheEntries.unshift(row);
  await refreshManualCountFromApi();
  return row;
}

/** Batch insert/update by URL through server POST. */
export async function importManualChannels(channels: M3uChannel[]): Promise<{
  processed: number;
}> {
  if (channels.length === 0) return { processed: 0 };
  const res = await zendeFetch("/api/channels/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channels }),
  });
  const body = (await res.json().catch(() => ({}))) as { processed?: number };
  const processed = typeof body.processed === "number" ? body.processed : 0;
  await refreshManualCountFromApi();
  return { processed };
}

export function updateManualChannelEntry(id: string, channel: M3uChannel): void {
  const idx = cacheEntries.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const prev = cacheEntries[idx]!;
  cacheEntries[idx] = { ...prev, channel };
  notifyManualChannelsUpdated();
  void zendeFetch("/api/channels/manual", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, channel }),
  }).then(() => refreshManualCountFromApi());
}

export function removeManualChannelEntry(id: string): void {
  cacheEntries = cacheEntries.filter((e) => e.id !== id);
  notifyManualChannelsUpdated();
  void zendeFetch("/api/channels/manual", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).then(() => refreshManualCountFromApi());
}

export function notifyManualChannelsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("zende-manual-channels-update"));
}

export function subscribeManualChannels(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const run = () => onChange();
  window.addEventListener("storage", run);
  window.addEventListener("zende-manual-channels-update", run);
  return () => {
    window.removeEventListener("storage", run);
    window.removeEventListener("zende-manual-channels-update", run);
  };
}
