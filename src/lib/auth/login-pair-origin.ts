function usableBrowserOrigin(value: string | null | undefined): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Resolve a phone-reachable origin even when Next sees the container as localhost. */
export function loginPairOrigin(
  request: Request,
  configuredOrigin = process.env.PUBLIC_APP_URL,
): string {
  const configured = usableBrowserOrigin(configuredOrigin?.trim().replace(/\/$/, ""));
  if (configured) return configured;

  // Same-origin POSTs expose the address actually used by the TV in Origin or Referer.
  const browserOrigin = usableBrowserOrigin(request.headers.get("origin"));
  if (browserOrigin) return browserOrigin;
  const refererOrigin = usableBrowserOrigin(request.headers.get("referer"));
  if (refererOrigin) return refererOrigin;

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = request.headers.get("host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHost;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto === "https" || forwardedProto === "http"
    ? forwardedProto
    : requestUrl.protocol.replace(":", "");
  const headerOrigin = usableBrowserOrigin(host ? `${proto}://${host}` : null);
  return headerOrigin ?? requestUrl.origin;
}
