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

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
