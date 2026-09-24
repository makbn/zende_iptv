/**
 * Strip *portal* hosts from IptvProviderChannel.url so streams are stored as
 * `/live|movie|series/...` paths. Distinct content CDN hosts (not equal to the
 * provider primary/backup serverUrl) are left absolute so that host is kept.
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeHost(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const withProto = /^https?:\/\//i.test(value) ? value : `http://${value}`;
    const u = new URL(withProto);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

const providers = await prisma.iptvProvider.findMany({
  select: { id: true, serverUrl: true, backupServerUrl: true },
});

let stripped = 0;
let preserved = 0;

for (const provider of providers) {
  const portalHosts = new Set(
    [normalizeHost(provider.serverUrl), normalizeHost(provider.backupServerUrl)].filter(Boolean),
  );
  if (portalHosts.size === 0) continue;

  const rows = await prisma.iptvProviderChannel.findMany({
    where: {
      providerId: provider.id,
      OR: [
        { url: { startsWith: "http://" } },
        { url: { startsWith: "https://" } },
      ],
    },
    select: { id: true, url: true },
  });

  for (const row of rows) {
    let origin;
    let pathname;
    try {
      const u = new URL(row.url);
      origin = `${u.protocol}//${u.host}`;
      pathname = u.pathname;
    } catch {
      continue;
    }
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length < 4 || !["live", "movie", "series"].includes(parts[0])) continue;
    const path = `/${parts.join("/")}`;

    if (!portalHosts.has(origin)) {
      preserved += 1;
      continue;
    }

    const nextKey = createHash("sha256").update(path).digest("hex");
    await prisma.iptvProviderChannel.update({
      where: { id: row.id },
      data: { url: path, externalKey: nextKey },
    });
    stripped += 1;
  }
}

console.log(
  `migrate-xtream-host-free-paths: stripped=${stripped} preservedDistinctHosts=${preserved}`,
);
await prisma.$disconnect();
