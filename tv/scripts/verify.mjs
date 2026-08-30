import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "android/settings.gradle.kts",
  "android/build.gradle.kts",
  "android/app/build.gradle.kts",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/java/com/zende/tv/MainActivity.java",
  "tizen/config.xml",
  "tizen/icon.png",
  "tizen/index.html",
  "tizen/app.js",
  "tizen/configured-server.js",
];

for (const relative of required) await access(resolve(root, relative));

const manifest = await readFile(resolve(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
const tizenConfig = await readFile(resolve(root, "tizen/config.xml"), "utf8");
const activity = await readFile(
  resolve(root, "android/app/src/main/java/com/zende/tv/MainActivity.java"),
  "utf8",
);

const assertions = [
  [manifest.includes("LEANBACK_LAUNCHER"), "Android TV launcher category"],
  [manifest.includes('android.hardware.touchscreen\" android:required=\"false'), "touch optional"],
  [activity.includes("ZendeTVShell/1.0 AndroidTV"), "TV user-agent marker"],
  [activity.includes("setMediaPlaybackRequiresUserGesture(false)"), "TV media autoplay"],
  [tizenConfig.includes('tizen:profile name=\"tv-samsung\"'), "Tizen TV profile"],
  [tizenConfig.includes("http://tizen.org/privilege/internet"), "Tizen network privilege"],
];

const failed = assertions.filter(([ok]) => !ok);
if (failed.length > 0) {
  for (const [, label] of failed) console.error(`Missing: ${label}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${required.length} TV shell files and ${assertions.length} platform requirements.`);
}
