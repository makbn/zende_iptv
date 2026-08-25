import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { personalDataStorageKey } from "@/lib/auth/personal-data-scope";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";

const STORAGE_KEY = "zende.viewing.v2";
const storageKey = () => personalDataStorageKey(STORAGE_KEY);

export type ViewingEntry = {
  url: string;
  name: string;
  tvgLogo?: string;
  groupTitle?: string;
  playback?: PlaybackSessionMeta;
  positionSeconds?: number;
  lastOpenedAt: number;
  openCount: number;
};

type Store = {
  entries: ViewingEntry[];
};

const MAX_ENTRIES = 200;

function readStore(): Store {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed?.entries)) return { entries: [] };
    return { entries: parsed.entries };
  } catch {
    return { entries: [] };
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

// ── Server sync helpers ──────────────────────────────────────────────────────

function serverRecord(entry: {
  url: string;
  name: string;
  tvgLogo?: string;
  groupTitle?: string;
  playback?: PlaybackSessionMeta;
}) {
  void zendeFetch("/api/user/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {/* best-effort */});
}

function serverRemoveEntry(url: string) {
  void zendeFetch(`/api/user/history?url=${encodeURIComponent(url)}`, {
    method: "DELETE",
  }).catch(() => {/* best-effort */});
}

/**
 * Fetch viewing history from the server and replace localStorage.
 * Server is the source of truth — replaces local copy on hydration.
 */
export async function hydrateHistoryFromServer(): Promise<void> {
  try {
    const res = await zendeFetch("/api/user/history?sort=recent");
    if (!res.ok) return;
    const rows = (await res.json()) as Array<{
      url: string;
      name: string;
      tvgLogo?: string | null;
      groupTitle?: string | null;
      playbackJson?: string | null;
      positionSeconds?: number | null;
      lastOpenedAt: string;
      openCount: number;
    }>;
    const entries: ViewingEntry[] = rows.map((r) => ({
      url: r.url,
      name: r.name,
      ...(r.tvgLogo ? { tvgLogo: r.tvgLogo } : {}),
      ...(r.groupTitle ? { groupTitle: r.groupTitle } : {}),
      ...(typeof r.positionSeconds === "number" && r.positionSeconds > 0
        ? { positionSeconds: r.positionSeconds }
        : {}),
      ...(r.playbackJson
        ? {
            playback: (() => {
              try {
                return JSON.parse(r.playbackJson) as PlaybackSessionMeta;
              } catch {
                return undefined;
              }
            })(),
          }
        : {}),
      lastOpenedAt: new Date(r.lastOpenedAt).getTime(),
      openCount: r.openCount,
    }));
    writeStore({ entries });
    notifyViewingStatsUpdated();
  } catch {
    /* network offline — keep localStorage */
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Call when a stream is opened. Updates recency, play counts, and optional artwork.
 */
export function recordPlaybackStart(input: {
  url: string;
  name: string;
  tvgLogo?: string;
  groupTitle?: string;
  playback?: PlaybackSessionMeta;
}): void {
  const store = readStore();
  const now = Date.now();
  const idx = store.entries.findIndex((e) => e.url === input.url);
  let next: ViewingEntry;
  if (idx >= 0) {
    const prev = store.entries[idx]!;
    next = {
      ...prev,
      name: input.name || prev.name,
      ...(input.tvgLogo ? { tvgLogo: input.tvgLogo } : {}),
      ...(input.groupTitle ? { groupTitle: input.groupTitle } : {}),
      ...(input.playback ? { playback: input.playback } : {}),
      lastOpenedAt: now,
      openCount: prev.openCount + 1,
    };
    store.entries.splice(idx, 1);
  } else {
    next = {
      url: input.url,
      name: input.name || "Live",
      ...(input.tvgLogo ? { tvgLogo: input.tvgLogo } : {}),
      ...(input.groupTitle ? { groupTitle: input.groupTitle } : {}),
      ...(input.playback ? { playback: input.playback } : {}),
      lastOpenedAt: now,
      openCount: 1,
    };
  }
  store.entries.unshift(next);
  if (store.entries.length > MAX_ENTRIES) {
    store.entries = store.entries.slice(0, MAX_ENTRIES);
  }
  writeStore(store);
  serverRecord(input);
}

export function listRecentPlayback(limit: number): ViewingEntry[] {
  const { entries } = readStore();
  return entries
    .slice()
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, Math.max(0, limit));
}

/** Channels you open often — tuned for "Because You Watch" style shelves. */
export function listTopByPlayCount(limit: number): ViewingEntry[] {
  const { entries } = readStore();
  return entries
    .filter((e) => e.openCount >= 2)
    .slice()
    .sort((a, b) => b.openCount - a.openCount || b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, Math.max(0, limit));
}

/** Top N channels by play count (includes first-time opens) — for watch "frequent" strip. */
export function listTopFrequentChannels(limit: number): ViewingEntry[] {
  const { entries } = readStore();
  return entries
    .slice()
    .sort(
      (a, b) =>
        b.openCount - a.openCount ||
        b.lastOpenedAt - a.lastOpenedAt ||
        a.name.localeCompare(b.name),
    )
    .slice(0, Math.max(0, limit));
}

/** Resolve full row data from cache + catalog (catalog wins for logos/metadata). */
export function viewingEntryToChannel(
  entry: ViewingEntry,
  catalog: M3uChannel[],
): M3uChannel {
  const found = catalog.find((c) => c.url === entry.url);
  const channel: M3uChannel =
    found ??
    ({
      name: entry.name,
      url: entry.url,
      duration: -1,
      ...(entry.tvgLogo ? { tvgLogo: entry.tvgLogo } : {}),
      ...(entry.groupTitle ? { groupTitle: entry.groupTitle } : {}),
    } satisfies M3uChannel);
  if (channel.contentType) return channel;
  return {
    ...channel,
    contentType: resolveLibraryContentType(channel),
  };
}

export function subscribeViewingStats(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const sameTab = () => onChange();
  window.addEventListener("storage", sameTab);
  window.addEventListener("zende-viewing-update", sameTab);
  return () => {
    window.removeEventListener("storage", sameTab);
    window.removeEventListener("zende-viewing-update", sameTab);
  };
}

export function notifyViewingStatsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("zende-viewing-update"));
}

/** Drop one URL from local playback history (e.g. "Recently watched"). */
export function removeViewingEntry(url: string): void {
  if (!url) return;
  const store = readStore();
  store.entries = store.entries.filter((e) => e.url !== url);
  writeStore(store);
  notifyViewingStatsUpdated();
  serverRemoveEntry(url);
}

/** Clear recently watched and play-count history on this device and server. */
export async function clearViewingHistory(): Promise<void> {
  clearViewingHistoryOnThisDevice();
  await zendeFetch("/api/user/history?all=1", { method: "DELETE" }).catch(
    () => {/* best-effort */},
  );
}

/** Remove cached viewing data without mutating another account on the server. */
export function clearViewingHistoryOnThisDevice(): void {
  writeStore({ entries: [] });
  notifyViewingStatsUpdated();
}

/** Persist latest watch position for Continue Watching resume cards. */
export function updateViewingPosition(url: string, positionSeconds: number): void {
  if (!url || !Number.isFinite(positionSeconds) || positionSeconds < 5) return;
  const store = readStore();
  const idx = store.entries.findIndex((e) => e.url === url);
  if (idx < 0) return;
  const prev = store.entries[idx]!;
  store.entries[idx] = {
    ...prev,
    positionSeconds: Math.round(positionSeconds),
  };
  writeStore(store);
  notifyViewingStatsUpdated();
}
