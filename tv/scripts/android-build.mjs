import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";

const tvRoot = resolve(import.meta.dirname, "..");
const androidRoot = resolve(tvRoot, "android");
const gradlew = resolve(androidRoot, "gradlew");
const sdkCandidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  resolve(homedir(), "Library/Android/sdk"),
].filter(Boolean);

let sdkRoot = null;
for (const candidate of sdkCandidates) {
  try {
    await access(resolve(candidate, "platform-tools"));
    sdkRoot = candidate;
    break;
  } catch {}
}

if (!sdkRoot) {
  console.error("Android SDK not found. Set ANDROID_HOME or install the Android command-line tools.");
  process.exit(1);
}

try {
  await access(gradlew);
} catch {
  console.error("Gradle wrapper is missing. Generate it with Gradle 9.4.1 in tv/android first.");
  process.exit(1);
}

const zendeUrl = process.env.ZENDE_TV_URL || "http://10.0.2.2:8077";
let parsedUrl;
try {
  parsedUrl = new URL(zendeUrl);
} catch {
  console.error("ZENDE_TV_URL must be a valid HTTP or HTTPS URL.");
  process.exit(1);
}
if (
  !["http:", "https:"].includes(parsedUrl.protocol) ||
  !parsedUrl.hostname ||
  parsedUrl.username ||
  parsedUrl.password
) {
  console.error("ZENDE_TV_URL must be an HTTP(S) URL without embedded credentials.");
  process.exit(1);
}

const child = spawn(gradlew, ["assembleDebug", `-PzendeUrl=${zendeUrl}`], {
  cwd: androidRoot,
  env: {
    ...process.env,
    ANDROID_HOME: sdkRoot,
    ANDROID_SDK_ROOT: sdkRoot,
    PATH: `${resolve(sdkRoot, "platform-tools")}${delimiter}${process.env.PATH || ""}`,
  },
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));
