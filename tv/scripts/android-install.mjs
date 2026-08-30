import { access } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";

const tvRoot = resolve(import.meta.dirname, "..");
const apk = resolve(tvRoot, "android/app/build/outputs/apk/debug/app-debug.apk");
const sdkRoots = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  resolve(homedir(), "Library/Android/sdk"),
].filter(Boolean);

let adb = "adb";
for (const root of sdkRoots) {
  const candidate = resolve(root, "platform-tools/adb");
  try {
    await access(candidate);
    adb = candidate;
    break;
  } catch {}
}

await access(apk).catch(() => {
  console.error("Debug APK not found. Run npm run android:build first.");
  process.exit(1);
});

const device = process.env.ZENDE_TV_DEVICE?.trim();
if (device) {
  const connected = spawnSync(adb, ["connect", device], { encoding: "utf8" });
  process.stdout.write(connected.stdout || "");
  process.stderr.write(connected.stderr || "");
}

const serialArgs = device ? ["-s", device] : [];
const child = spawn(adb, [...serialArgs, "install", "-r", apk], { stdio: "inherit" });
child.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const launch = spawnSync(
    adb,
    [...serialArgs, "shell", "am", "start", "-n", "com.zende.tv/.MainActivity"],
    { encoding: "utf8" },
  );
  process.stdout.write(launch.stdout || "");
  process.stderr.write(launch.stderr || "");
  process.exit(launch.status ?? 1);
});

