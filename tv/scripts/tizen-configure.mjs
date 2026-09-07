import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tizenRoot = resolve(import.meta.dirname, "../tizen");
const buildResult = resolve(tizenRoot, ".buildResult");
const configuredUrl = process.env.ZENDE_TV_URL?.trim();
if (!configuredUrl) {
  console.error("Set ZENDE_TV_URL before configuring the Tizen launcher.");
  process.exit(1);
}

const parsed = new URL(configuredUrl);
if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
  console.error("ZENDE_TV_URL must be an HTTP(S) URL without embedded credentials.");
  process.exit(1);
}

const appPath = resolve(tizenRoot, "app.js");
const source = await readFile(appPath, "utf8");
const assignment = `localStorage.setItem("zende.tv.serverUrl", ${JSON.stringify(parsed.href.replace(/\/+$/, ""))});\n`;
await writeFile(resolve(buildResult, "configured-server.js"), assignment, "utf8");

if (!source.includes('var storageKey = "zende.tv.serverUrl"')) {
  throw new Error("Unexpected Tizen launcher source; configuration marker is missing.");
}
console.log(`Prepared Tizen default server: ${parsed.href}`);
