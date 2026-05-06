import "server-only";

import tls from "node:tls";
import { Agent, ProxyAgent } from "undici";
import { SocksClient } from "socks";

import type { StoredProxyConfig } from "./proxy-store";

function buildSocks5Agent(cfg: StoredProxyConfig): Agent {
  // undici connector callback: success → (null, socket), failure → (err, null)
  // Cast to `any` to avoid the overloaded CallbackArgs union fighting with tsc.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connect = (opts: any, callback: any) => {
    SocksClient.createConnection(
      {
        proxy: {
          host: cfg.host,
          port: cfg.port,
          type: 5,
          ...(cfg.username
            ? { userId: cfg.username, password: cfg.password ?? "" }
            : {}),
        },
        command: "connect",
        destination: {
          host: opts.hostname as string,
          port: Number(opts.port),
        },
      },
      (err, info) => {
        if (err || !info) {
          callback(err ?? new Error("SOCKS5 connection failed"), null);
          return;
        }
        // Upgrade to TLS for https: targets, pass raw socket for http:
        if (opts.protocol === "https:") {
          const tlsSocket = tls.connect({
            socket: info.socket as tls.TLSSocket,
            servername: opts.hostname as string,
            rejectUnauthorized: false,
          });
          callback(null, tlsSocket);
        } else {
          callback(null, info.socket);
        }
      },
    );
  };
  return new Agent({ connect });
}

/** Returns an undici Agent (or ProxyAgent) that routes all fetches through the configured proxy. */
export function buildProxyAgent(cfg: StoredProxyConfig): Agent | ProxyAgent {
  if (cfg.protocol === "socks5") {
    return buildSocks5Agent(cfg);
  }
  // HTTP / HTTPS proxy via undici ProxyAgent
  const auth = cfg.username
    ? `${encodeURIComponent(cfg.username)}:${encodeURIComponent(cfg.password ?? "")}@`
    : "";
  const uri = `${cfg.protocol}://${auth}${cfg.host}:${cfg.port}`;
  return new ProxyAgent({ uri, requestTls: { rejectUnauthorized: false } });
}
