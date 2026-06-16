export const CATALOG_CLEARED_EVENT = "zenede-catalog-cleared";

export function notifyCatalogCleared(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CATALOG_CLEARED_EVENT));
}

export function subscribeCatalogCleared(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CATALOG_CLEARED_EVENT, onChange);
  return () => window.removeEventListener(CATALOG_CLEARED_EVENT, onChange);
}
