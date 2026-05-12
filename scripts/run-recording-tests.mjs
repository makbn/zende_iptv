#!/usr/bin/env node
/**
 * Applies Prisma migrations to the integration test SQLite file, then runs Vitest
 * with an absolute DATABASE_URL so Prisma always opens the same DB as migrate.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = path.join(root, "prisma", "vitest-integration.db");
const databaseUrl = pathToFileURL(dbFile).href;

process.env.DATABASE_URL = databaseUrl;
process.chdir(root);

execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });

execSync(
  "npx vitest run src/lib/http/request-origin.test.ts src/lib/recordings/recording-relay.integration.test.ts",
  { stdio: "inherit", env: process.env },
);
