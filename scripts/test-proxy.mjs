#!/usr/bin/env node
/**
 * Proxy stress-test: randomly samples stream URLs from the DB, runs them through
 * the same fetch strategy the proxy uses (spoofed UA, manual redirects, cookies,
 * 8 s timeout), and reports pass/fail. Retries every failure on the next round
 * plus a fresh random batch, iterating until everything passes or MAX_ITERS is
 * reached.
 *
 * Usage:
 *   node scripts/test-proxy.mjs               # 100 URLs, up to 5 rounds
 *   node scripts/test-proxy.mjs --batch 50    # smaller batch
 *   node scripts/test-proxy.mjs --rounds 3    # fewer rounds
 *   node scripts/test-proxy.mjs --url <url>   # test one specific URL
 *   node scripts/test-proxy.mjs --concur 20   # parallel fetch slots
 */

import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

// ── DB setup ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL?.trim()) {
  const dbFile = path.join(__dirname, "..", "prisma", "dev.db");
  process.env.DATABASE_URL = pathToFileURL(dbFile).href;
}

const prisma = new PrismaClient({ log: ["error"] });

// ── Proxy constants (mirror src/app/api/stream/proxy/[sessionId]/route.ts) ──

const UPSTREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 8_000; // a bit looser than prod (5 s) to distinguish dead vs slow
const MAX_REDIRECT_HOPS = 10;

// ── Fetch logic (mirrors fetchFollowingRedirects) ───────────────────────────

/**
 * @param {string} startUrl
 * @returns {Promise<{ok: boolean, status: number|null, effectiveUrl: string, error?: string, isHls?: boolean, lineCount?: number, latencyMs: number}>}
 */
async function probeUrl(startUrl) {
  const t0 = Date.now();
  let currentUrl = startUrl;

  try {
    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
      /** @type {Response} */
      let res;

      try {
        res = await fetch(currentUrl, {
          redirect: "manual",
          headers: {
            "User-Agent": UPSTREAM_UA,
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: (() => {
              try { return new URL(currentUrl).origin + "/"; } catch { return currentUrl; }
            })(),
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (fetchErr) {
        const isTimeout =
          fetchErr instanceof Error &&
          (fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError");
        if (isTimeout) {
          return { ok: false, status: null, effectiveUrl: currentUrl, error: "timeout", latencyMs: Date.now() - t0 };
        }
        // Undici wraps the real OS error in err.cause — extract it for better classification
        const cause = fetchErr instanceof Error ? fetchErr.cause : null;
        const causeMsg = cause instanceof Error ? cause.message : (cause ? String(cause) : null);
        const rawMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        const detail = causeMsg ?? rawMsg;
        let errLabel;
        if (/ECONNREFUSED/i.test(detail)) errLabel = "econnrefused";
        else if (/ECONNRESET/i.test(detail)) errLabel = "econnreset";
        else if (/ENOTFOUND|EAI_AGAIN/i.test(detail)) errLabel = "dns-fail";
        else if (/ETIMEDOUT/i.test(detail)) errLabel = "timeout";
        else if (/certificate|SSL|TLS/i.test(detail)) errLabel = "tls-error";
        else errLabel = `fetch-error: ${detail.slice(0, 60)}`;
        return { ok: false, status: null, effectiveUrl: currentUrl, error: errLabel, latencyMs: Date.now() - t0 };
      }

      // Follow 3xx manually (same as proxy)
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          // No Location — treat as final
          await res.body?.cancel().catch(() => {});
          return { ok: false, status: res.status, effectiveUrl: currentUrl, error: `redirect-no-location (${res.status})`, latencyMs: Date.now() - t0 };
        }
        await res.body?.cancel().catch(() => {});
        currentUrl = new URL(loc, currentUrl).href;
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, status: res.status, effectiveUrl: currentUrl, error: `http-${res.status}`, latencyMs: Date.now() - t0 };
      }

      // Read body to detect HLS
      const ct = res.headers.get("content-type") ?? "";
      let text;
      try {
        const buf = await res.arrayBuffer();
        text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      } catch (readErr) {
        return { ok: false, status: res.status, effectiveUrl: currentUrl, error: `read-error: ${readErr.message}`, latencyMs: Date.now() - t0 };
      }

      const isHls =
        ct.toLowerCase().includes("mpegurl") ||
        /\.m3u8(\?|$)/i.test(currentUrl) ||
        text.trimStart().startsWith("#EXTM3U") ||
        text.trimStart().startsWith("#EXTINF");

      if (!isHls) {
        // Not HLS — could be a direct MPEG-TS stream (starts with 0x47), JSON, HTML, etc.
        const first2 = text.slice(0, 2);
        const looksLikeBinary = first2.charCodeAt(0) === 0x47; // TS sync byte
        return {
          ok: looksLikeBinary, // raw TS stream is playable; anything else is unexpected
          status: res.status,
          effectiveUrl: currentUrl,
          error: looksLikeBinary ? undefined : `not-hls (ct=${ct || "none"}, head=${JSON.stringify(text.slice(0, 40))})`,
          isHls: false,
          latencyMs: Date.now() - t0,
        };
      }

      const nonCommentLines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#")).length;
      return {
        ok: true,
        status: res.status,
        effectiveUrl: currentUrl,
        isHls: true,
        lineCount: nonCommentLines,
        latencyMs: Date.now() - t0,
      };
    }

    return { ok: false, status: null, effectiveUrl: currentUrl, error: `too-many-redirects (>${MAX_REDIRECT_HOPS})`, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, status: null, effectiveUrl: currentUrl, error: `unexpected: ${err?.message ?? String(err)}`, latencyMs: Date.now() - t0 };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

async function runBatch(urls, concurrency) {
  /** @type {Map<string, Awaited<ReturnType<probeUrl>>>} */
  const results = new Map();
  let done = 0;
  const total = urls.length;

  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(u => probeUrl(u)));
    for (let j = 0; j < chunk.length; j++) {
      results.set(chunk[j], chunkResults[j]);
      done++;
    }
    process.stdout.write(`\r  ${done}/${total} tested…`);
  }
  process.stdout.write("\r" + " ".repeat(30) + "\r");
  return results;
}

function errorCategory(result) {
  if (result.ok) return "ok";
  if (!result.error) return `http-${result.status ?? "?"}`;
  const e = result.error;
  if (e === "timeout" || e === "etimedout") return "timeout";
  if (e.startsWith("http-")) return e;
  if (e === "econnrefused") return "econnrefused";
  if (e === "econnreset") return "econnreset";
  if (e === "dns-fail") return "dns-fail";
  if (e === "tls-error") return "tls-error";
  if (e.startsWith("fetch-error")) return "fetch-error";
  if (e.startsWith("not-hls")) return "not-hls";
  if (e.startsWith("too-many-redirects") || e.startsWith("redirect-loop")) return "redirect-loop";
  return "other";
}

function printBreakdown(results) {
  /** @type {Map<string, number>} */
  const cats = new Map();
  for (const r of results.values()) {
    const c = errorCategory(r);
    cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  const sorted = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    const pct = ((count / results.size) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(count / results.size * 20));
    console.log(`  ${cat.padEnd(18)} ${String(count).padStart(4)}  ${pct.padStart(5)}%  ${bar}`);
  }
}

function printSampleFailures(results, max = 8) {
  let shown = 0;
  for (const [url, r] of results.entries()) {
    if (r.ok) continue;
    const short = url.length > 70 ? url.slice(0, 67) + "…" : url;
    console.log(`  [${(r.status ?? "ERR").toString().padEnd(3)}] ${(r.error ?? "?").padEnd(30)}  ${short}`);
    if (++shown >= max) break;
  }
}

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let BATCH_SIZE = 100;
let MAX_ITERS = 5;
let CONCURRENCY = 15;
let SINGLE_URL = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--batch" && args[i + 1]) BATCH_SIZE = parseInt(args[++i], 10);
  else if (args[i] === "--rounds" && args[i + 1]) MAX_ITERS = parseInt(args[++i], 10);
  else if (args[i] === "--concur" && args[i + 1]) CONCURRENCY = parseInt(args[++i], 10);
  else if (args[i] === "--url" && args[i + 1]) SINGLE_URL = args[++i];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (SINGLE_URL) {
    console.log(`\nProbing: ${SINGLE_URL}`);
    const r = await probeUrl(SINGLE_URL);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  const total = await prisma.channelRegistryEntry.count();
  console.log(`\nDB: ${total.toLocaleString()} channel URLs`);
  if (total === 0) {
    console.log("No channels in DB. Sync playlists in the app first.");
    return;
  }

  // Load all URLs once (SQLite is local — cheap)
  const allUrls = (await prisma.channelRegistryEntry.findMany({ select: { url: true } })).map(e => e.url);

  /** @type {Map<string, Awaited<ReturnType<probeUrl>>>} */
  const persistentFailures = new Map(); // url → last failing result
  const testedSet = new Set();

  let globalPass = 0;
  let globalFail = 0;

  for (let round = 1; round <= MAX_ITERS; round++) {
    const sep = "─".repeat(62);
    console.log(`\n${sep}`);
    console.log(`Round ${round}/${MAX_ITERS}`);
    console.log(sep);

    // Build batch: retry previous failures + fresh random sample
    const retryUrls = [...persistentFailures.keys()];
    const needed = Math.max(0, BATCH_SIZE - retryUrls.length);
    const pool = shuffle(allUrls.filter(u => !testedSet.has(u)));
    const freshUrls = pool.slice(0, needed);

    const batchUrls = [...new Set([...retryUrls, ...freshUrls])];
    console.log(`  URLs: ${batchUrls.length} total (${retryUrls.length} retried + ${freshUrls.length} new)`);
    console.log(`  Concurrency: ${CONCURRENCY}  Timeout: ${FETCH_TIMEOUT_MS / 1000}s`);
    console.log();

    const results = await runBatch(batchUrls, CONCURRENCY);

    // Update sets
    for (const url of batchUrls) testedSet.add(url);

    const passed = [...results.values()].filter(r => r.ok);
    const failed = [...results.entries()].filter(([, r]) => !r.ok);

    globalPass += passed.length;
    globalFail += failed.length;

    const avgLatency = passed.length
      ? Math.round(passed.reduce((s, r) => s + r.latencyMs, 0) / passed.length)
      : 0;

    console.log(`Results:  ${passed.length} passed  |  ${failed.length} failed  |  avg latency ${avgLatency} ms`);
    console.log();

    // Update persistent failures: remove URLs that now pass
    for (const [url, r] of results.entries()) {
      if (r.ok) persistentFailures.delete(url);
      else persistentFailures.set(url, r);
    }

    if (failed.length === 0) {
      console.log("  ✓ All URLs in this round worked through proxy logic.\n");
      if (round < MAX_ITERS) continue; // keep going with new random samples
    }

    console.log("Failure breakdown:");
    printBreakdown(new Map(failed));
    console.log();

    console.log(`Sample failures:`);
    printSampleFailures(new Map(failed));

    // Diagnose patterns and give guidance
    const cats = new Map();
    for (const [, r] of failed) {
      const c = errorCategory(r);
      cats.set(c, (cats.get(c) ?? 0) + 1);
    }

    console.log("\nDiagnosis:");
    const timeouts   = cats.get("timeout")      ?? 0;
    const http403    = cats.get("http-403")     ?? 0;
    const http404    = cats.get("http-404")     ?? 0;
    const dnsFail    = cats.get("dns-fail")     ?? 0;
    const notHls     = cats.get("not-hls")      ?? 0;
    const connReset  = cats.get("econnreset")   ?? 0;
    const connRefused = cats.get("econnrefused") ?? 0;
    const tlsErr     = cats.get("tls-error")    ?? 0;

    if (timeouts > failed.length * 0.4) {
      console.log("  ⚠ Many timeouts — these streams likely SYN-drop server IPs (CDN IP blocks).");
      console.log("    Circuit breaker handles this: proxy returns 502 instantly after first timeout.");
    }
    if (http403 > failed.length * 0.3) {
      console.log("  ⚠ Many 403s — CloudFront / CDN auth. Streams need browser-side signed cookies.");
      console.log("    These cannot be proxied without the viewer's session cookies (by design).");
    }
    if (http404 > failed.length * 0.3) {
      console.log("  ⚠ Many 404s — streams may be dead/rotated. Check if URLs are up-to-date.");
    }
    if (dnsFail > failed.length * 0.2) {
      console.log("  ⚠ DNS failures — some CDN hostnames may be region-locked or decommissioned.");
    }
    if (connReset > 5) {
      console.log("  ⚠ ECONNRESET — remote servers closing connections mid-request (dead streams).");
    }
    if (tlsErr > 3) {
      console.log("  ⚠ TLS errors — certificate or SSL issues on upstream hosts.");
    }
    if (notHls > 5) {
      console.log("  ⚠ Some URLs return non-HLS content — could be direct MPEG-TS, FLV, or redirects.");
      console.log("    These may still play in hls.js if the player handles the format.");
    }
    if (connRefused > 5) {
      console.log("  ⚠ Connection refused — hosts are up but the port is closed or filtered.");
    }

    const expectedFail = timeouts + connReset + connRefused + dnsFail + tlsErr
      + http403 + http404 + (cats.get("http-401") ?? 0) + (cats.get("http-504") ?? 0)
      + (cats.get("http-429") ?? 0) + notHls;
    const proxyBugCandidates = [...results.entries()].filter(([, r]) => {
      if (r.ok) return false;
      const cat = errorCategory(r);
      const expected = new Set(["timeout","http-403","http-401","http-404","http-504","http-429","dns-fail","econnrefused","econnreset","tls-error","not-hls"]);
      if (expected.has(cat)) return false;
      if (r.error?.startsWith("read-error")) return false;
      return true;
    });
    if (proxyBugCandidates.length > 0) {
      console.log(`\n  ❌ ${proxyBugCandidates.length} unexpected failure(s) — may indicate a proxy bug:`);
      for (const [url, r] of proxyBugCandidates.slice(0, 5)) {
        console.log(`     [${(r.status ?? "ERR").toString().padEnd(3)}] ${r.error}  ${url.slice(0, 65)}`);
      }
    } else {
      const deadStreams = failed.length - expectedFail;
      if (deadStreams <= 0) {
        console.log("  ✓ All failures are expected dead-stream / CDN-block categories. Proxy is working.");
      }
    }
  }

  console.log("\n" + "═".repeat(62));
  console.log("FINAL SUMMARY");
  console.log("═".repeat(62));
  console.log(`  Total URLs tested    : ${testedSet.size.toLocaleString()}`);
  console.log(`  Pass events          : ${globalPass.toLocaleString()}`);
  console.log(`  Fail events          : ${globalFail.toLocaleString()}`);
  console.log(`  Persistent failures  : ${persistentFailures.size.toLocaleString()}`);

  if (persistentFailures.size > 0) {
    console.log("\nPersistent failure breakdown (failed every round they were tested):");
    const pCats = new Map();
    for (const r of persistentFailures.values()) {
      const c = errorCategory(r);
      pCats.set(c, (pCats.get(c) ?? 0) + 1);
    }
    for (const [cat, count] of [...pCats.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(18)} ${count}`);
    }

    // Expected dead-stream / upstream-policy failures that are NOT proxy bugs:
    //   timeout / econnreset / econnrefused / dns-fail / tls-error → network dead
    //   http-403 / http-401 → CDN auth or credentials required
    //   http-404             → stale iptv-org URL
    //   http-504 / http-429  → upstream gateway / rate-limit
    //   not-hls              → DASH or non-HLS format the proxy isn't built for
    //   read-error           → continuous live-stream body that never closes
    const expectedCategories = new Set([
      "timeout", "http-403", "http-401", "http-404", "http-504", "http-429",
      "dns-fail", "econnrefused", "econnreset", "tls-error", "not-hls",
    ]);
    const coreProxyFailures = [...persistentFailures.entries()].filter(
      ([, r]) => {
        const cat = errorCategory(r);
        if (expectedCategories.has(cat)) return false;
        if (r.error?.startsWith("read-error")) return false; // continuous stream body
        return true;
      }
    );
    if (coreProxyFailures.length > 0) {
      console.log(`\n  ❌ ${coreProxyFailures.length} failures may indicate a proxy bug (not CDN/network):`);
      for (const [url, r] of coreProxyFailures) {
        console.log(`     [${(r.status ?? "ERR").toString().padEnd(3)}] ${r.error}  ${url.slice(0, 70)}`);
      }
    } else {
      console.log("\n  ✓ All persistent failures are CDN/network issues (expected for server-side proxy).");
      console.log("    The proxy code itself is working correctly.");
    }
  } else {
    console.log("\n  ✓ No persistent failures detected.");
  }
  console.log();
}

main()
  .catch(err => { console.error("\nFatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
