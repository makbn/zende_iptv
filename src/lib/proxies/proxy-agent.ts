import "server-only";

import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
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

/**
 * Smart DNS agent: resolves every hostname through the configured DNS server(s)
 * before opening a direct TCP/TLS connection to the resolved IP.
 *
 * Smart DNS providers return a proxy IP for geo-restricted domains (e.g. the
 * BBC iPlayer origin returns an IP in a UK proxy instead of the real server),
 * so the content server sees a permitted country without tunnelling all traffic.
 * The TCP connection and TLS handshake are direct — only DNS is rerouted.
 */
function buildSmartDnsAgent(cfg: StoredProxyConfig): Agent {
  const servers = cfg.dnsServer2
    ? [cfg.dnsServer!, cfg.dnsServer2]
    : [cfg.dnsServer!];

  const resolver = new dns.Resolver({ timeout: 5_000, tries: 2 });
  resolver.setServers(servers);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connect = (opts: any, callback: any) => {
    const hostname = opts.hostname as string;
    const port = Number(opts.port);

    const openSocket = (ip: string) => {
      if (opts.protocol === "https:") {
        // Direct TLS — SNI uses the original hostname so the remote server
        // presents the right certificate, but the TCP connection goes to the
        // Smart DNS-resolved IP.
        const socket = tls.connect({
          host: ip,
          port: port || 443,
          servername: hostname,
          rejectUnauthorized: false,
        });
        callback(null, socket);
      } else {
        const socket = net.connect({ host: ip, port: port || 80 });
        callback(null, socket);
      }
    };

    if (net.isIP(hostname)) {
      openSocket(hostname);
      return;
    }

    resolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses?.length) {
        callback(
          err ?? new Error(`Smart DNS: could not resolve ${hostname}`),
          null,
        );
        return;
      }
      openSocket(addresses[0]);
    });
  };

  return new Agent({ connect });
}

/** Returns an undici dispatcher that routes all fetches through the configured proxy/DNS. */
export function buildProxyAgent(cfg: StoredProxyConfig): Agent | ProxyAgent {
  if (cfg.vpnType === "smartdns") {
    return buildSmartDnsAgent(cfg);
  }
  if (cfg.protocol === "socks5") {
    return buildSocks5Agent(cfg);
  }
  // HTTP / HTTPS proxy via undici ProxyAgent
  const auth = cfg.username
    ? `${encodeURIComponent(cfg.username)}:${encodeURIComponent(cfg.password ?? "")}@`
    : "";
  const uri = `${cfg.protocol}://${auth}${cfg.host}:${cfg.port}`;
  return new ProxyAgent({ uri, connect: { rejectUnauthorized: false } });
}
