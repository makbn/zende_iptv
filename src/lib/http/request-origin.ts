/** Public origin for rewriting playlist URLs (honors reverse proxies). */
export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const proto = (forwardedProto ?? url.protocol.replace(":", "")).split(",")[0]?.trim();
    const safeProto =
      proto === "http" || proto === "https" ? proto : url.protocol.replace(":", "");
    return `${safeProto}://${forwardedHost.split(",")[0]!.trim()}`;
  }
  return url.origin;
}
