import "server-only";

import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * When `.env` has no `DATABASE_URL`, use SQLite under `prisma/dev.db`.
 * Absolute `file:` URL avoids cwd quirks during Next.js dev / HMR (fixes missing DB / 500s).
 */
function defaultDevDatabaseUrl(): string {
  const filePath = path.join(process.cwd(), "prisma", "dev.db");
  return pathToFileURL(filePath).href;
}

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = defaultDevDatabaseUrl();
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaReady: boolean;
};

function prismaLogLevels(): Array<"query" | "info" | "warn" | "error"> {
  if (process.env.NODE_ENV === "production") return ["error"];
  const q = process.env.PRISMA_LOG_QUERIES?.trim();
  if (q === "1" || q === "true") return ["query", "warn", "error"];
  return ["warn", "error"];
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLogLevels(),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Apply SQLite performance pragmas once at module load time.
 *
 * - WAL journal mode: readers never block writers; writers never block readers.
 *   Eliminates SQLITE_BUSY under concurrent HLS segment + alias-write load.
 * - synchronous=NORMAL: safe with WAL (fsync on checkpoint, not every write).
 * - busy_timeout: instead of immediately raising SQLITE_BUSY (→ Prisma P1008),
 *   SQLite retries for up to 10 s waiting for the lock to release.
 *
 * These pragmas persist for the lifetime of the SQLite file (WAL) or the
 * connection (busy_timeout), so they only need to run once at startup.
 */
if (!globalForPrisma.prismaReady) {
  globalForPrisma.prismaReady = true;
  void (async () => {
    try {
      await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL");
      await prisma.$executeRawUnsafe("PRAGMA synchronous=NORMAL");
      await prisma.$executeRawUnsafe("PRAGMA busy_timeout=10000");
    } catch {
      // Non-fatal — e.g. unit-test in-memory DB or unsupported driver
    }
  })();
}
