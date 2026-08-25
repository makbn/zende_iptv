import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { getPersonalDataScope, personalDataStorageKey } from "@/lib/auth/personal-data-scope";

const STORAGE_KEY = "zende.favorites.v2";
const storageKey = () => personalDataStorageKey(STORAGE_KEY);

export type FavoriteChannel = {
  url: string;
  name: string;
  tvgId?: string;
  tvgLogo?: string;
  groupTitle?: string;
  addedAt: number;
};

type Store = {
  favorites: FavoriteChannel[];
};

const MAX_FAVORITES = 500;

let favoriteUrlSet: Set<string> | null = null;
let favoriteUrlSetScope: string | null = null;

function rebuildFavoriteUrlSet(store?: Store): Set<string> {
  favoriteUrlSet = new Set((store ?? readStore()).favorites.map((f) => f.url));
  favoriteUrlSetScope = getPersonalDataScope();
  return favoriteUrlSet;
}

function getFavoriteUrlSet(): Set<string> {
  if (!favoriteUrlSet || favoriteUrlSetScope !== getPersonalDataScope()) {
    return rebuildFavoriteUrlSet();
  }
  return favoriteUrlSet;
}

function readStore(): Store {
  if (typeof window === "undefined") return { favorites: [] };
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return { favorites: [] };
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed?.favorites)) return { favorites: [] };
    return { favorites: parsed.favorites };
  } catch {
    return { favorites: [] };
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(store));
    rebuildFavoriteUrlSet(store);
  } catch {
    /* quota */
  }
}

// ── Server sync helpers ──────────────────────────────────────────────────────

/** Fire-and-forget: push a mutation to the server without blocking UI. */
function serverAdd(fav: FavoriteChannel) {
  void zendeFetch("/api/user/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: fav.url,
      name: fav.name,
      tvgId: fav.tvgId,
      tvgLogo: fav.tvgLogo,
      groupTitle: fav.groupTitle,
    }),
  }).catch(() => {/* best-effort */});
}

function serverRemove(url: string) {
  void zendeFetch(`/api/user/favorites?url=${encodeURIComponent(url)}`, {
    method: "DELETE",
  }).catch(() => {/* best-effort */});
}

/**
 * Fetch favorites from the server and merge into localStorage.
 * Server is the source of truth — replaces local copy on hydration.
 */
export async function hydrateFavoritesFromServer(): Promise<void> {
  try {
    const res = await zendeFetch("/api/user/favorites");
    if (!res.ok) return;
    const rows = (await res.json()) as Array<{
      url: string;
      name: string;
      tvgId?: string | null;
      tvgLogo?: string | null;
      groupTitle?: string | null;
      addedAt: string;
    }>;
    const favorites: FavoriteChannel[] = rows.map((r) => ({
      url: r.url,
      name: r.name,
      ...(r.tvgId?.trim() ? { tvgId: r.tvgId.trim() } : {}),
      ...(r.tvgLogo ? { tvgLogo: r.tvgLogo } : {}),
      ...(r.groupTitle ? { groupTitle: r.groupTitle } : {}),
      addedAt: new Date(r.addedAt).getTime(),
    }));
    writeStore({ favorites });
    notifyFavoritesUpdated();
  } catch {
    /* network offline — keep localStorage */
  }
}

/** Server-enriched favorite rows as playable channels (no full client catalog). */
export async function fetchEnrichedFavoritesFromApi(options?: {
  fallbackToLocal?: boolean;
}): Promise<M3uChannel[]> {
  const fallbackToLocal = options?.fallbackToLocal !== false;
  try {
    const res = await zendeFetch("/api/user/favorites?enrich=1");
    if (!res.ok) {
      return fallbackToLocal
        ? listFavorites().map((f) => enrichFavoriteWithCatalog(f, []))
        : [];
    }
    const rows = (await res.json()) as Array<{
      channel?: M3uChannel;
      url: string;
      name: string;
      tvgId?: string | null;
      tvgLogo?: string | null;
      groupTitle?: string | null;
    }>;
    return rows.map((row) => {
      if (row.channel) return row.channel;
      return enrichFavoriteWithCatalog(
        {
          url: row.url,
          name: row.name,
          ...(row.tvgId?.trim() ? { tvgId: row.tvgId.trim() } : {}),
          ...(row.tvgLogo ? { tvgLogo: row.tvgLogo } : {}),
          ...(row.groupTitle ? { groupTitle: row.groupTitle } : {}),
          addedAt: 0,
        },
        [],
      );
    });
  } catch {
    return fallbackToLocal
      ? listFavorites().map((f) => enrichFavoriteWithCatalog(f, []))
      : [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function listFavorites(): FavoriteChannel[] {
  return readStore()
    .favorites.slice()
    .sort((a, b) => b.addedAt - a.addedAt);
}

export function isFavorite(url: string): boolean {
  if (!url) return false;
  return getFavoriteUrlSet().has(url);
}

export function addFavorite(
  input: Pick<M3uChannel, "url" | "name"> &
    Partial<Pick<M3uChannel, "tvgId" | "tvgLogo" | "groupTitle">>,
): void {
  const store = readStore();
  const url = input.url;
  if (!url) return;
  const idx = store.favorites.findIndex((f) => f.url === url);
  const row: FavoriteChannel = {
    url,
    name: input.name?.trim() || "Channel",
    ...(input.tvgId?.trim() ? { tvgId: input.tvgId.trim() } : {}),
    ...(input.tvgLogo ? { tvgLogo: input.tvgLogo } : {}),
    ...(input.groupTitle ? { groupTitle: input.groupTitle } : {}),
    addedAt: Date.now(),
  };
  if (idx >= 0) {
    store.favorites[idx] = {
      ...store.favorites[idx]!,
      ...row,
      addedAt: store.favorites[idx]!.addedAt,
    };
  } else {
    store.favorites.unshift(row);
    if (store.favorites.length > MAX_FAVORITES) {
      store.favorites = store.favorites.slice(0, MAX_FAVORITES);
    }
  }
  writeStore(store);
  notifyFavoritesUpdated(input.url);
  serverAdd(row);
}

export function removeFavorite(url: string): void {
  const store = readStore();
  store.favorites = store.favorites.filter((f) => f.url !== url);
  writeStore(store);
  notifyFavoritesUpdated(url);
  serverRemove(url);
}

/** Clear every favorite on this device and on the server. */
export async function clearAllFavorites(): Promise<void> {
  clearFavoritesOnThisDevice();
  await zendeFetch("/api/user/favorites?all=1", { method: "DELETE" }).catch(
    () => {/* best-effort */},
  );
}

/** Remove cached favorites without mutating another account on the server. */
export function clearFavoritesOnThisDevice(): void {
  writeStore({ favorites: [] });
  notifyFavoritesUpdated();
}

export function toggleFavorite(
  input: Pick<M3uChannel, "url" | "name"> &
    Partial<Pick<M3uChannel, "tvgId" | "tvgLogo" | "groupTitle">>,
): boolean {
  if (isFavorite(input.url)) {
    removeFavorite(input.url);
    return false;
  }
  addFavorite(input);
  return true;
}

type FavoriteListener = { url: string | null; cb: () => void };
const favoriteListeners = new Set<FavoriteListener>();

export function notifyFavoritesUpdated(changedUrl?: string): void {
  if (typeof window === "undefined") return;
  for (const listener of favoriteListeners) {
    if (listener.url == null || listener.url === changedUrl) {
      listener.cb();
    }
  }
  window.dispatchEvent(new Event("zende-favorites-update"));
}

export function subscribeFavorites(onChange: () => void): () => void {
  return subscribeFavoriteUrl(null, onChange);
}

/** Subscribe to favorite changes for one URL (or all when url is null). */
export function subscribeFavoriteUrl(
  url: string | null,
  onChange: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const entry: FavoriteListener = { url, cb: onChange };
  favoriteListeners.add(entry);
  const onStorage = () => onChange();
  window.addEventListener("storage", onStorage);
  return () => {
    favoriteListeners.delete(entry);
    window.removeEventListener("storage", onStorage);
  };
}

/** Merge stored favorite with live catalog row when available. */
export function enrichFavoriteWithCatalog(
  fav: FavoriteChannel,
  catalog: M3uChannel[],
): M3uChannel {
  const live = catalog.find((c) => c.url === fav.url);
  if (live) {
    const fid = fav.tvgId?.trim();
    if (fid && !live.tvgId?.trim()) {
      return { ...live, tvgId: fid };
    }
    return live;
  }
  return {
    url: fav.url,
    name: fav.name,
    duration: -1,
    ...(fav.tvgId?.trim() ? { tvgId: fav.tvgId.trim() } : {}),
    ...(fav.tvgLogo ? { tvgLogo: fav.tvgLogo } : {}),
    ...(fav.groupTitle ? { groupTitle: fav.groupTitle } : {}),
  };
}
