#!/usr/bin/env node

import { spawn } from "node:child_process";

const baseUrl = process.env.XTREAM_URL?.trim().replace(/\/+$/, "");
const username = process.env.XTREAM_USERNAME?.trim();
const password = process.env.XTREAM_PASSWORD?.trim();
const durationSeconds = Math.max(8, Number(process.env.PROBE_SECONDS || 20));
const bucketMs = Math.max(100, Number(process.env.PROBE_BUCKET_MS || 250));
const probeFormat = process.env.PROBE_FORMAT?.trim().toLowerCase() || "ts";

if (!baseUrl || !username || !password) {
  console.error(
    "Set XTREAM_URL, XTREAM_USERNAME, and XTREAM_PASSWORD. Optional: PROBE_SECONDS, CHANNEL_A, CHANNEL_B.",
  );
  process.exit(2);
}

function apiUrl(action) {
  const url = new URL("/player_api.php", baseUrl);
  url.searchParams.set("username", username);
  url.searchParams.set("password", password);
  if (action) url.searchParams.set("action", action);
  return url;
}

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Provider API returned HTTP ${response.status}.`);
  return response.json();
}

function chooseChannel(streams, requested, fallbackIndex, excludedId) {
  const available = streams.filter(
    (stream) => String(stream.stream_id) !== String(excludedId ?? ""),
  );
  if (requested) {
    const needle = requested.toLowerCase();
    const match = available.find((stream) =>
      String(stream.name || "").toLowerCase().includes(needle),
    );
    if (!match) throw new Error(`No live channel matched ${JSON.stringify(requested)}.`);
    return match;
  }
  const preferred = available.filter((stream) => /\btsn\s*[12]\b/i.test(String(stream.name || "")));
  return preferred[fallbackIndex] ?? available[fallbackIndex];
}

async function probeStream(channel, startMs) {
  const controller = new AbortController();
  const buckets = Array.from(
    { length: Math.ceil((durationSeconds * 1_000) / bucketMs) + 2 },
    () => 0,
  );
  const streamUrl = new URL(
    `/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(channel.stream_id)}.ts`,
    baseUrl,
  );
  const timer = setTimeout(() => controller.abort(), durationSeconds * 1_000);
  let status = 0;
  let contentType = "";
  let totalBytes = 0;
  let error = null;
  try {
    const response = await fetch(streamUrl, {
      headers: { Accept: "video/mp2t,*/*", "User-Agent": "Zende concurrency probe" },
      redirect: "follow",
      signal: controller.signal,
    });
    status = response.status;
    contentType = response.headers.get("content-type") || "";
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const bytes = part.value.byteLength;
      totalBytes += bytes;
      const bucket = Math.max(0, Math.floor((Date.now() - startMs) / bucketMs));
      if (bucket < buckets.length) buckets[bucket] += bytes;
    }
  } catch (cause) {
    if (!(controller.signal.aborted && cause instanceof Error && cause.name === "AbortError")) {
      error = cause instanceof Error ? cause.message.replace(streamUrl.href, "[redacted]") : String(cause);
    }
  } finally {
    clearTimeout(timer);
  }
  return {
    name: String(channel.name || channel.stream_id),
    id: String(channel.stream_id),
    status,
    contentType,
    totalBytes,
    buckets,
    error,
  };
}

async function probeHlsWithFfmpeg(channel) {
  const streamUrl = new URL(
    `/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(channel.stream_id)}.m3u8`,
    baseUrl,
  );
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats",
        "-i", streamUrl.href, "-t", String(durationSeconds),
        "-map", "0:v:0?", "-map", "0:a:0?", "-f", "null", "-",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let decodedUs = 0;
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), (durationSeconds + 30) * 1_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || "";
      for (const line of lines) {
        const match = /^out_time_us=(\d+)$/.exec(line);
        if (match) decodedUs = Math.max(decodedUs, Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4_000) stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ name: String(channel.name), code: -1, decodedSeconds: 0, wallMs: Date.now() - started, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const redactedError = stderr
        .replaceAll(username, "[username]")
        .replaceAll(password, "[password]")
        .trim()
        .slice(0, 500);
      resolve({
        name: String(channel.name),
        code: code ?? -1,
        decodedSeconds: decodedUs / 1_000_000,
        wallMs: Date.now() - started,
        error: redactedError,
      });
    });
  });
}

function mib(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function longestInactiveRun(buckets, threshold) {
  let longest = 0;
  let current = 0;
  for (const bytes of buckets) {
    if (bytes < threshold) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

try {
  const account = await json(apiUrl());
  const userInfo = account?.user_info || {};
  const streams = await json(apiUrl("get_live_streams"));
  if (!Array.isArray(streams) || streams.length < 2) {
    throw new Error("Provider returned fewer than two live channels.");
  }

  const first = chooseChannel(streams, process.env.CHANNEL_A?.trim(), 0);
  const second = chooseChannel(streams, process.env.CHANNEL_B?.trim(), 1, first.stream_id);
  if (!first || !second) throw new Error("Could not choose two distinct live channels.");

  console.log(`Provider: ${new URL(baseUrl).host}`);
  console.log(
    `Account status=${userInfo.status ?? "unknown"} active_cons=${userInfo.active_cons ?? "unknown"} max_connections=${userInfo.max_connections ?? "unknown"}`,
  );
  console.log(`Testing simultaneously for ${durationSeconds}s: ${first.name} | ${second.name}`);

  if (probeFormat === "hls") {
    const results = await Promise.all([
      probeHlsWithFfmpeg(first),
      probeHlsWithFfmpeg(second),
    ]);
    for (const result of results) {
      console.log(
        `${result.name}: ffmpeg exit=${result.code}, decoded=${result.decodedSeconds.toFixed(1)}s, wall=${(result.wallMs / 1_000).toFixed(1)}s${result.error ? `, error=${result.error}` : ""}`,
      );
    }
    const healthy = results.every(
      (result) => result.code === 0 && result.decodedSeconds >= durationSeconds * 0.8,
    );
    console.log(
      healthy
        ? "VERDICT: Provider sustained two concurrent HLS playback sessions from this IP."
        : "VERDICT: Provider did not sustain both HLS playback sessions.",
    );
    if (!healthy) process.exitCode = 1;
    process.exit();
  }

  const startMs = Date.now();
  const [a, b] = await Promise.all([
    probeStream(first, startMs),
    probeStream(second, startMs),
  ]);
  const activeThreshold = 4 * 1024;
  const slotCount = Math.ceil((durationSeconds * 1_000) / bucketMs);
  const overlap = Array.from({ length: slotCount }, (_, index) => index).filter(
    (index) => a.buckets[index] >= activeThreshold && b.buckets[index] >= activeThreshold,
  );

  for (const result of [a, b]) {
    const measured = result.buckets.slice(0, slotCount);
    const activeSlots = measured.filter((bytes) => bytes >= activeThreshold).length;
    const longestStallMs = longestInactiveRun(measured, activeThreshold) * bucketMs;
    console.log(
      `${result.name}: HTTP ${result.status || "none"}, ${mib(result.totalBytes)} MiB, active ${activeSlots}/${slotCount} slots, longest stall ${longestStallMs}ms${result.error ? `, error=${result.error}` : ""}`,
    );
  }
  console.log(`Simultaneous byte flow: ${overlap.length}/${slotCount} x ${bucketMs}ms slots`);

  const bothHealthy =
    a.status >= 200 && a.status < 300 &&
    b.status >= 200 && b.status < 300 &&
    a.totalBytes >= 256 * 1024 &&
    b.totalBytes >= 256 * 1024 &&
    overlap.length >= Math.min(8, Math.floor(slotCount / 4));
  if (bothHealthy) {
    console.log("VERDICT: Provider supports these two concurrent live streams from this IP.");
  } else {
    console.log("VERDICT: Concurrent delivery was not sustained. Check the account connection limit/provider policy.");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Probe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
