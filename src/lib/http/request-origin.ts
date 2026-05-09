/** True when Host is loopback / container bind — not safe for absolute URLs in HLS playlists. */
function isLoopbackOrWildcardHost(host: string): boolean {
  const h = host.split(":")[0]?.replace(/^\[|\]$/g, "").toLowerCase() ?? "";
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === ""
  );
}

function pickProto(
  url: URL,
  forwardedProto: string | undefined,
): "http" | "https" {
  if (forwardedProto === "https" || forwardedProto === "http") {
    return forwardedProto;
  }
  if (process.env.NODE_ENV === "production") {
    return "https";
  }
  const fromUrl = url.protocol.replace(":", "");
  return fromUrl === "https" ? "https" : "http";
}

/** First hop of RFC 7239 `Forwarded` (some proxies send this when `X-Forwarded-Host` is absent). */
function parseForwardedHeader(request: Request): {
  host?: string;
  proto?: "http" | "https";
} {
  const raw = request.headers.get("forwarded");
  if (!raw) return {};
  const firstHop = raw.split(",")[0]?.trim();
  if (!firstHop) return {};
  let host: string | undefined;
  let proto: "http" | "https" | undefined;
  for (const part of firstHop.split(";")) {
    const m = part.trim().match(/^([a-z]+)=(.+)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === "host") host = val;
    if (key === "proto" && (val === "https" || val === "http")) proto = val;
  }
  return { host, proto };
}

/**
 * Origin to embed in rewritten HLS URLs (`/api/stream/proxy/...`, subtitles, variants).
 *
 * **Default (no env):** same site the client already used — e.g. a request to
 * `https://live.example.com/get.php?...` or `.../live/.../1.m3u8` supplies `Host: live.example.com`
 * and usually `X-Forwarded-Proto: https` from your edge proxy, so playlist lines become
 * `https://live.example.com/api/stream/proxy/...`. Paths stay on that host; no separate
 * “sub-address” configuration is required.
 *
 * **`PUBLIC_APP_URL`** is optional: use only if your reverse proxy strips `Host` /
 * `X-Forwarded-Host` / `Forwarded` and manifests would otherwise fall back to
 * `http://127.0.0.1:...` inside the container.
 */
export function getRequestOrigin(request: Request): string {
  const fromEnv = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv;
  }

  const url = new URL(request.url);
  const xfProtoRaw = request.headers.get("x-forwarded-proto");
  const xfProto = xfProtoRaw?.split(",")[0]?.trim();

  const xfHostRaw = request.headers.get("x-forwarded-host");
  const xfHost = xfHostRaw?.split(",")[0]?.trim();
  if (xfHost) {
    const proto = pickProto(url, xfProto);
    return `${proto}://${xfHost}`;
  }

  const fwd = parseForwardedHeader(request);
  if (fwd.host && !isLoopbackOrWildcardHost(fwd.host)) {
    const proto = fwd.proto ?? pickProto(url, xfProto);
    return `${proto}://${fwd.host}`;
  }

  const hostRaw = request.headers.get("host");
  const host = hostRaw?.split(",")[0]?.trim();
  if (host && !isLoopbackOrWildcardHost(host)) {
    const proto = pickProto(url, xfProto);
    return `${proto}://${host}`;
  }

  return url.origin;
}
