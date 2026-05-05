#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const mode = process.argv[2];
const extra = process.argv.slice(3);

if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/run-next.mjs dev|start [...extra next args]");
  process.exit(1);
}

const port = process.env.PORT || "8077";
const nextArgs =
  mode === "dev"
    ? ["next", "dev", "--webpack", "-p", port, ...extra]
    : ["next", "start", "-p", port, ...extra];

const child = spawn("npx", nextArgs, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PORT: port },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
