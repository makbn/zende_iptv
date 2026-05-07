import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getGluetunContainerAddress } from "@/lib/proxies/gluetun-manager";

export type ProxyConfigRow = {
  id: string;
  name: string;
  vpnType: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  vpnProvider: string | null;
  vpnConfigJson: string | null;
  gluetunContainerId: string | null;
  gluetunHostPort: number | null;
  gluetunStatus: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredProxyConfig = {
  id: string;
  vpnType?: "direct" | "gluetun";
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
};

export function parseProxyConfigJson(raw: string | null): StoredProxyConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredProxyConfig;
  } catch {
    return null;
  }
}

export async function listProxies(): Promise<ProxyConfigRow[]> {
  return prisma.proxyConfig.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getProxy(id: string): Promise<ProxyConfigRow | null> {
  return prisma.proxyConfig.findUnique({ where: { id } });
}

export async function createProxy(input: {
  name: string;
  vpnType?: string;
  protocol?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  vpnProvider?: string;
  vpnConfigJson?: string;
  createdByUserId?: string | null;
}): Promise<ProxyConfigRow> {
  return prisma.proxyConfig.create({
    data: {
      name: input.name.trim(),
      vpnType: input.vpnType ?? "direct",
      protocol: input.protocol ?? "http",
      host: input.host?.trim() ?? "",
      port: input.port ?? 0,
      username: input.username?.trim() || null,
      password: input.password || null,
      vpnProvider: input.vpnProvider ?? null,
      vpnConfigJson: input.vpnConfigJson ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function updateProxy(
  id: string,
  input: {
    name?: string;
    protocol?: string;
    host?: string;
    port?: number;
    username?: string | null;
    password?: string | null;
    vpnProvider?: string | null;
    vpnConfigJson?: string | null;
    gluetunContainerId?: string | null;
    gluetunHostPort?: number | null;
    gluetunStatus?: string;
  },
): Promise<ProxyConfigRow> {
  return prisma.proxyConfig.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
      ...(input.host !== undefined ? { host: input.host.trim() } : {}),
      ...(input.port !== undefined ? { port: input.port } : {}),
      ...(input.username !== undefined ? { username: input.username?.trim() || null } : {}),
      ...(input.password !== undefined ? { password: input.password || null } : {}),
      ...(input.vpnProvider !== undefined ? { vpnProvider: input.vpnProvider } : {}),
      ...(input.vpnConfigJson !== undefined ? { vpnConfigJson: input.vpnConfigJson } : {}),
      ...(input.gluetunContainerId !== undefined ? { gluetunContainerId: input.gluetunContainerId } : {}),
      ...(input.gluetunHostPort !== undefined ? { gluetunHostPort: input.gluetunHostPort } : {}),
      ...(input.gluetunStatus !== undefined ? { gluetunStatus: input.gluetunStatus } : {}),
    },
  });
}

export async function deleteProxy(id: string): Promise<void> {
  await prisma.proxyConfig.delete({ where: { id } });
}

export class ProxyNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyNotReadyError";
  }
}

export async function getProxyForChannel(urlHash: string): Promise<StoredProxyConfig | null> {
  const row = await prisma.channelProxyAssignment.findUnique({
    where: { urlHash },
    include: { proxy: true },
  });
  if (!row) return null;
  const p = row.proxy;

  if (p.vpnType === "gluetun") {
    // Allow "starting" as well as "running" — the HTTP proxy port is bound and
    // reachable even while the VPN tunnel is still negotiating. Reject only when
    // the container was never started (no port) or has definitively failed/stopped.
    if ((p.gluetunStatus === "running" || p.gluetunStatus === "starting") && p.gluetunContainerId) {
      // Inspect the container to get its direct bridge IP and internal port.
      // This works regardless of whether Zende itself runs in Docker or not,
      // and avoids relying on host-mapped ports or host.docker.internal.
      const addr = await getGluetunContainerAddress(p.gluetunContainerId);
      if (!addr) throw new ProxyNotReadyError(
        `VPN container "${p.name}" is running but its IP could not be resolved. Try relaunching it from Settings → VPN Proxies.`,
      );
      return { id: p.id, vpnType: "gluetun", protocol: "http", host: addr.host, port: addr.port };
    }
    throw new ProxyNotReadyError(
      `VPN container "${p.name}" is not running (status: ${p.gluetunStatus}). ` +
      `Launch it from Settings → VPN Proxies before watching this channel.`,
    );
  }

  return {
    id: p.id,
    vpnType: "direct",
    protocol: p.protocol,
    host: p.host,
    port: p.port,
    username: p.username ?? undefined,
    password: p.password ?? undefined,
  };
}

export async function assignChannelsToProxy(
  proxyId: string,
  urlHashes: string[],
): Promise<void> {
  await prisma.$transaction(
    urlHashes.map((h) =>
      prisma.channelProxyAssignment.upsert({
        where: { urlHash: h },
        create: { urlHash: h, proxyId },
        update: { proxyId },
      }),
    ),
  );
}

export async function removeChannelFromProxy(urlHash: string): Promise<void> {
  await prisma.channelProxyAssignment.deleteMany({ where: { urlHash } });
}

export async function listProxyChannels(
  proxyId: string,
  opts?: { q?: string; skip?: number; take?: number },
) {
  const { q, skip = 0, take = 50 } = opts ?? {};
  const where = {
    proxyId,
    ...(q ? { channel: { label: { contains: q } } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.channelProxyAssignment.findMany({
      where,
      include: { channel: true },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.channelProxyAssignment.count({ where }),
  ]);
  return { rows: rows.map((r) => r.channel), total };
}

export async function markGluetunError(proxyId: string): Promise<void> {
  await prisma.proxyConfig.updateMany({
    where: { id: proxyId, vpnType: "gluetun" },
    data: { gluetunStatus: "error" },
  });
}

export async function countProxyChannels(proxyId: string): Promise<number> {
  return prisma.channelProxyAssignment.count({ where: { proxyId } });
}

/** Search channels not yet assigned to a given proxy */
export async function searchUnassignedChannels(opts: {
  q: string;
  excludeProxyId?: string;
  take?: number;
}) {
  const { q, excludeProxyId, take = 30 } = opts;
  const assigned = excludeProxyId
    ? await prisma.channelProxyAssignment.findMany({
        where: { proxyId: excludeProxyId },
        select: { urlHash: true },
      })
    : [];
  const excludeHashes = assigned.map((a) => a.urlHash);
  return prisma.channelRegistryEntry.findMany({
    where: {
      ...(q ? { label: { contains: q } } : {}),
      ...(excludeHashes.length > 0 ? { urlHash: { notIn: excludeHashes } } : {}),
    },
    take,
    orderBy: { label: "asc" },
  });
}
