import { spawn } from "node:child_process";
import { resolve } from "node:path";

const profile = process.env.TIZEN_CERT_PROFILE?.trim();
if (!profile) {
  console.error("Set TIZEN_CERT_PROFILE to a Samsung certificate profile name.");
  process.exit(1);
}

const buildResult = resolve(import.meta.dirname, "../tizen/.buildResult");
const child = spawn("tizen", ["package", "-t", "wgt", "-s", profile, "--", buildResult], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));

