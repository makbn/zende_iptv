import "server-only";

import net from "net";
import dns from "dns/promises";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import Docker from "dockerode";

const docker = new Docker();

const GLUETUN_IMAGE = "ghcr.io/qdm12/gluetun:latest";
const PROXY_INTERNAL_PORT = 8888;

// When running inside Docker, Gluetun containers are launched as siblings on
// the host daemon. Bind-mount paths in HostConfig.Binds must be HOST paths,
// not paths inside this container.
//
//   GLUETUN_HOST_WORKDIR      — path on the HOST where config dirs are stored
//   GLUETUN_CONTAINER_WORKDIR — where that same directory is mounted here
//
// Both default to os.tmpdir() for local (non-Docker) development where the
// host and container share the same filesystem.
const HOST_WORKDIR =
  process.env.GLUETUN_HOST_WORKDIR ?? tmpdir();
const CONTAINER_WORKDIR =
  process.env.GLUETUN_CONTAINER_WORKDIR ?? tmpdir();

// ── VPN config types ──────────────────────────────────────────────────────────

export type GluetunVpnConfig =
  | { provider: "nordvpn"; username: string; password: string; countries: string }
  | { provider: "expressvpn"; activationCode: string; countries: string }
  | { provider: "protonvpn"; username: string; password: string; countries: string }
  | { provider: "custom_openvpn"; ovpnConfig: string; username?: string; password?: string; extraFiles?: Record<string, string> }
  | {
      provider: "custom_wireguard";
      privateKey: string;
      addresses: string;
      peerPublicKey: string;
      peerEndpoint: string;
      peerPort: number;
    };

export function parseVpnConfig(json: string | null): GluetunVpnConfig | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as GluetunVpnConfig;
  } catch {
    return null;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function buildEnv(cfg: GluetunVpnConfig): string[] {
  const base = ["HTTPPROXY=on", "HTTPPROXY_LOG=off"];
  switch (cfg.provider) {
    case "nordvpn":
      return [
        ...base,
        "VPN_SERVICE_PROVIDER=nordvpn",
        "VPN_TYPE=openvpn",
        `OPENVPN_USER=${cfg.username}`,
        `OPENVPN_PASSWORD=${cfg.password}`,
        `SERVER_COUNTRIES=${cfg.countries}`,
        "SERVER_CATEGORIES=standard",
      ];
    case "expressvpn":
      return [
        ...base,
        "VPN_SERVICE_PROVIDER=expressvpn",
        "VPN_TYPE=openvpn",
        `EXPRESSVPN_ACTIVATION_CODE=${cfg.activationCode}`,
        `SERVER_COUNTRIES=${cfg.countries}`,
      ];
    case "protonvpn":
      return [
        ...base,
        "VPN_SERVICE_PROVIDER=protonvpn",
        "VPN_TYPE=openvpn",
        `OPENVPN_USER=${cfg.username}`,
        `OPENVPN_PASSWORD=${cfg.password}`,
        `SERVER_COUNTRIES=${cfg.countries}`,
      ];
    case "custom_openvpn":
      return [
        ...base,
        "VPN_SERVICE_PROVIDER=custom",
        "VPN_TYPE=openvpn",
        "OPENVPN_CUSTOM_CONFIG=/gluetun/custom.conf",
        ...(cfg.username ? [`OPENVPN_USER=${cfg.username}`] : []),
        ...(cfg.password ? [`OPENVPN_PASSWORD=${cfg.password}`] : []),
      ];
    case "custom_wireguard":
      return [
        ...base,
        "VPN_SERVICE_PROVIDER=custom",
        "VPN_TYPE=wireguard",
        `WIREGUARD_PRIVATE_KEY=${cfg.privateKey}`,
        `WIREGUARD_ADDRESSES=${cfg.addresses}`,
        `VPN_ENDPOINT_IP=${cfg.peerEndpoint}`,
        `VPN_ENDPOINT_PORT=${String(cfg.peerPort)}`,
        `WIREGUARD_PUBLIC_KEY=${cfg.peerPublicKey}`,
      ];
  }
}

function containerName(proxyId: string): string {
  return `gluetun-${proxyId}`;
}

// Remove any existing container with this proxy's name (idempotent restart)
async function removeExistingContainer(proxyId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerName(proxyId));
    await container.stop({ t: 3 }).catch(() => null);
    await container.remove({ force: true });
  } catch {
    // not found — fine
  }
}

async function pullImageIfMissing(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
  } catch {
    await new Promise<void>((resolve, reject) => {
      docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2: Error | null) => {
          if (err2) reject(err2); else resolve();
        });
      });
    });
  }
}

const OVPN_FILE_DIRECTIVES = new Set(["ca", "cert", "key", "tls-auth", "tls-crypt", "tls-crypt-v2", "dh", "pkcs12", "secret"]);

// Rewrite bare filenames in file directives to absolute /gluetun/<name> paths so
// OpenVPN can find them regardless of its working directory inside the container.
function rewriteOvpnFilePaths(ovpn: string, mountDir: string): string {
  return ovpn
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("#") || trimmed.startsWith(";")) return line;
      const parts = trimmed.split(/\s+/);
      const directive = parts[0] ?? "";
      if (!OVPN_FILE_DIRECTIVES.has(directive)) return line;
      const value = parts[1];
      if (!value || value === "[inline]" || value.startsWith("/")) return line;
      // Strip leading "./" then prepend the mount path
      parts[1] = `${mountDir}/${value.replace(/^\.\//, "")}`;
      const indent = line.match(/^\s+/)?.[0] ?? "";
      return indent + parts.join(" ");
    })
    .join("\n");
}

// Gluetun requires IP addresses in `remote` lines, not hostnames.
// Walk each `remote <host> [port] [proto]` line and resolve the host if needed.
async function resolveOvpnRemotes(ovpn: string): Promise<string> {
  const lines = ovpn.split("\n");
  const resolved = await Promise.all(
    lines.map(async (line) => {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("remote ")) return line;
      const parts = trimmed.split(/\s+/);
      // parts: ["remote", host, port?, proto?]
      const host = parts[1];
      if (!host || net.isIP(host)) return line;
      try {
        const [ip] = await dns.resolve4(host);
        parts[1] = ip;
        return (line.startsWith(" ") || line.startsWith("\t") ? line.match(/^\s+/)?.[0] ?? "" : "") + parts.join(" ");
      } catch {
        // If resolution fails, leave the line as-is and let Gluetun error clearly
        return line;
      }
    }),
  );
  return resolved.join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startGluetunContainer(
  proxyId: string,
  vpnConfigJson: string,
): Promise<{ containerId: string; hostPort: number }> {
  const cfg = parseVpnConfig(vpnConfigJson);
  if (!cfg) throw new Error("Invalid VPN config JSON");

  await pullImageIfMissing(GLUETUN_IMAGE);
  await removeExistingContainer(proxyId);
  const hostPort = await findFreePort();
  const env = buildEnv(cfg);

  const binds: string[] = [];
  if (cfg.provider === "custom_openvpn") {
    // Write config files to the container-side path so the running process can
    // access them. The bind mount passed to the Gluetun container must use the
    // HOST-side path because Gluetun runs as a sibling on the host daemon.
    const containerDir = join(CONTAINER_WORKDIR, `gluetun-${proxyId}`);
    const hostDir = join(HOST_WORKDIR, `gluetun-${proxyId}`);
    await mkdir(containerDir, { recursive: true });
    const resolvedConfig = rewriteOvpnFilePaths(
      await resolveOvpnRemotes(cfg.ovpnConfig),
      "/gluetun",
    );
    await writeFile(join(containerDir, "custom.conf"), resolvedConfig, "utf8");
    if (cfg.extraFiles) {
      await Promise.all(
        Object.entries(cfg.extraFiles).map(([name, content]) =>
          writeFile(join(containerDir, name), content, "utf8"),
        ),
      );
    }
    binds.push(`${hostDir}:/gluetun`);
  }

  const container = await docker.createContainer({
    Image: GLUETUN_IMAGE,
    name: containerName(proxyId),
    Env: env,
    ExposedPorts: { [`${PROXY_INTERNAL_PORT}/tcp`]: {} },
    HostConfig: {
      CapAdd: ["NET_ADMIN"],
      Devices: [
        { PathOnHost: "/dev/net/tun", PathInContainer: "/dev/net/tun", CgroupPermissions: "rwm" },
      ],
      PortBindings: {
        [`${PROXY_INTERNAL_PORT}/tcp`]: [{ HostPort: String(hostPort) }],
      },
      Binds: binds,
    },
  });

  await container.start();
  return { containerId: container.id, hostPort };
}

export async function stopGluetunContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 5 });
    await container.remove();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Already gone — not an error
    if (msg.includes("no such container") || msg.includes("404")) return;
    throw err;
  }
}

export type GluetunRuntimeStatus = "stopped" | "starting" | "running" | "error";

export async function getGluetunContainerStatus(
  containerId: string | null,
): Promise<GluetunRuntimeStatus> {
  if (!containerId) return "stopped";
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    if (!info.State.Running) return "stopped";
    const health = info.State.Health?.Status;
    if (health === "healthy") return "running";
    if (health === "unhealthy") return "error";
    return "starting";
  } catch {
    return "stopped";
  }
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}
