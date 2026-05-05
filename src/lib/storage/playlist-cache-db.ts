/**
 * Browser-only IndexedDB cache for parsed playlist channels (large lists exceed localStorage).
 */

import type { M3uChannel } from "@/core/playlist/m3u-parse";

const DB_NAME = "zenede";
const DB_VERSION = 1;
const STORE = "parsedPlaylists";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "presetId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type CachedPlaylist = {
  presetId: string;
  updatedAt: number;
  channels: M3uChannel[];
};

export async function putParsedPlaylist(
  cache: CachedPlaylist,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(cache);
    tx.oncomplete = () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("zenede-playlist-cache-updated"));
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getParsedPlaylist(
  presetId: string,
): Promise<CachedPlaylist | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(presetId);
    req.onsuccess = () => resolve(req.result as CachedPlaylist | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteParsedPlaylist(presetId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(presetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
