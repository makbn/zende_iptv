const PARENTAL_ACCESS_CHANGED_EVENT = "zende:parental-access-changed";

export function notifyParentalAccessChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PARENTAL_ACCESS_CHANGED_EVENT));
}

export function subscribeParentalAccessChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PARENTAL_ACCESS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PARENTAL_ACCESS_CHANGED_EVENT, listener);
}
