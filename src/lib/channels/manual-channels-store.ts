import type { M3uChannel } from "@/core/playlist/m3u-parse";

const STORAGE_KEY = "zenede.manualChannels.v1";

export type ManualChannelEntry = {
  id: string;
  channel: M3uChannel;
  addedAt: number;
};

type Store = {
  entries: ManualChannelEntry[];
};

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
    /* quota */
  }
}

export function isAllowedManualStreamUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function listManualChannelEntries(): ManualChannelEntry[] {
  return readStore()
    .entries.slice()
    .sort((a, b) => b.addedAt - a.addedAt);
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function manualChannelExists(url: string): boolean {
  const key = url.trim();
  return readStore().entries.some((e) => e.channel.url.trim() === key);
}

/** Insert or replace by URL (manual list wins on duplicate URL). */
export function upsertManualChannel(channel: M3uChannel): ManualChannelEntry {
  const store = readStore();
  const urlKey = channel.url.trim();
  const idx = store.entries.findIndex((e) => e.channel.url.trim() === urlKey);
  const row: ManualChannelEntry = {
    id: idx >= 0 ? store.entries[idx]!.id : newId(),
    channel,
    addedAt: Date.now(),
  };
  if (idx >= 0) {
    store.entries[idx] = row;
  } else {
    store.entries.unshift(row);
  }
  writeStore(store);
  notifyManualChannelsUpdated();
  return row;
}

export function removeManualChannelEntry(id: string): void {
  const store = readStore();
  store.entries = store.entries.filter((e) => e.id !== id);
  writeStore(store);
  notifyManualChannelsUpdated();
}

export function notifyManualChannelsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("zenede-manual-channels-update"));
}

export function subscribeManualChannels(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const run = () => onChange();
  window.addEventListener("storage", run);
  window.addEventListener("zenede-manual-channels-update", run);
  return () => {
    window.removeEventListener("storage", run);
    window.removeEventListener("zenede-manual-channels-update", run);
  };
}
