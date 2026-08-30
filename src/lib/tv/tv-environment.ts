const TV_USER_AGENT =
  /ZendeTVShell|smart-tv|smarttv|tizen|webos|web0s|hbbtv|netcast|viera|bravia|android tv|googletv|aft|firetv/i;

const TV_BROWSER_MODE_KEY = "zende-tv-browser-mode";

/**
 * TV shells are detected by user agent. `?tv=1` enables the same mode in a
 * desktop browser for keyboard testing and keeps it active for that tab.
 */
export function isTvEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  const requested = new URLSearchParams(window.location.search).get("tv");
  try {
    if (requested === "1") sessionStorage.setItem(TV_BROWSER_MODE_KEY, "1");
    if (requested === "0") sessionStorage.removeItem(TV_BROWSER_MODE_KEY);
    if (sessionStorage.getItem(TV_BROWSER_MODE_KEY) === "1") return true;
  } catch {
    // Storage can be unavailable in privacy-restricted TV browsers.
  }

  return TV_USER_AGENT.test(navigator.userAgent);
}
