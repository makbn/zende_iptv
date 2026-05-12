import "server-only";

import type { StoredProxyConfig } from "@/lib/proxies/proxy-store";

/**
 * FFmpeg `-http_proxy` URL for direct / Gluetun HTTP proxies.
 * Smart DNS cannot be expressed as an HTTP proxy for ffmpeg — caller must reject earlier.
 */
export function httpProxyUrlForFfmpeg(
  proxy: StoredProxyConfig | null,
): string | undefined {
  if (!proxy) return undefined;
  if (proxy.vpnType === "smartdns") return undefined;
  if (!proxy.host?.trim() || !proxy.port) return undefined;
  const proto = (proxy.protocol || "http").trim() || "http";
  const user = proxy.username?.trim();
  const pass = proxy.password;
  const auth =
    user && pass !== undefined
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
      : user
        ? `${encodeURIComponent(user)}@`
        : "";
  return `${proto}://${auth}${proxy.host.trim()}:${proxy.port}`;
}
