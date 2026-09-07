import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const profile = process.env.TIZEN_CERT_PROFILE?.trim();
if (!profile) {
  console.error("Set TIZEN_CERT_PROFILE to a Samsung certificate profile name.");
  process.exit(1);
}

const buildResult = resolve(import.meta.dirname, "../tizen/.buildResult");
// Never let a previous package become an entry inside the next package.
await rm(resolve(buildResult, "Zende.wgt"), { force: true });
const child = spawn("tizen", ["package", "-t", "wgt", "-s", profile, "--", buildResult], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
