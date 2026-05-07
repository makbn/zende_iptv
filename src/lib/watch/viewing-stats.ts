import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";

const STORAGE_KEY = "zenede.viewing.v1";

export type ViewingEntry = {
  url: string;
  name: string;
  tvgLogo?: string;
  groupTitle?: string;
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
    const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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
      lastOpenedAt: string;
      openCount: number;
    }>;
    const entries: ViewingEntry[] = rows.map((r) => ({
      url: r.url,
      name: r.name,
      ...(r.tvgLogo ? { tvgLogo: r.tvgLogo } : {}),
      ...(r.groupTitle ? { groupTitle: r.groupTitle } : {}),
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
  if (found) return found;
  return {
    name: entry.name,
    url: entry.url,
    duration: -1,
    ...(entry.tvgLogo ? { tvgLogo: entry.tvgLogo } : {}),
    ...(entry.groupTitle ? { groupTitle: entry.groupTitle } : {}),
  };
}

export function subscribeViewingStats(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const sameTab = () => onChange();
  window.addEventListener("storage", sameTab);
  window.addEventListener("zenede-viewing-update", sameTab);
  return () => {
    window.removeEventListener("storage", sameTab);
    window.removeEventListener("zenede-viewing-update", sameTab);
  };
}

export function notifyViewingStatsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("zenede-viewing-update"));
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
