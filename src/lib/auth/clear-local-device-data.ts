"use client";

const KNOWN_DATABASES = ["zende"];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function clearIndexedDb(): Promise<void> {
  if (!("indexedDB" in window)) return;
  let names = KNOWN_DATABASES;
  try {
    if (typeof indexedDB.databases === "function") {
      const rows = await indexedDB.databases();
      names = rows
        .map((row) => row.name)
        .filter((name): name is string => Boolean(name));
    }
  } catch {
    // Older Safari versions do not expose database enumeration.
  }
  await Promise.all([...new Set([...names, ...KNOWN_DATABASES])].map(deleteDatabase));
}

function clearClientCookies(): void {
  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name));
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=${location.pathname || "/"}; SameSite=Lax`;
  }
}

/** Erase every piece of Zende state stored by this browser/device. */
export async function clearLocalDeviceData(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    localStorage.clear();
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}
  try {
    clearClientCookies();
  } catch {}

  await clearIndexedDb().catch(() => {});

  if ("caches" in window) {
    await caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      .catch(() => {});
  }
}
