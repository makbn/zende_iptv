import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL?.trim() ||
        pathToFileURL(path.join(root, "prisma", "vitest-integration.db")).href,
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      "server-only": path.resolve(root, "tests/shims/server-only.ts"),
    },
  },
});
