#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import {
  AdaptiveHlsTimesliceProbe,
  SerializedHttpClient,
  growthSequence,
  makeApiUrl,
  summarizeAccount,
} from "./lib/hls-timeslice-probe.mjs";

const config = {
  strategy: enumEnv("PROBE_STRATEGY", "round-robin", ["round-robin", "batch"]),
  maxChannels: integerEnv("PROBE_MAX_CHANNELS", 64, 1, 200),
  stageSeconds: numberEnv("PROBE_STAGE_SECONDS", 60, 15, 3_600),
  warmupSeconds: numberEnv("PROBE_WARMUP_SECONDS", 18, 5, 600),
  startupBufferSeconds: numberEnv("PROBE_STARTUP_BUFFER_SECONDS", 8, 1, 120),
  requestTimeoutMs: integerEnv("PROBE_REQUEST_TIMEOUT_MS", 20_000, 1_000, 180_000),
  maxRequestErrorRate: numberEnv("PROBE_MAX_REQUEST_ERROR_RATE", 0.02, 0, 1),
  maxSegmentErrorRate: numberEnv("PROBE_MAX_SEGMENT_ERROR_RATE", 0.02, 0, 1),
  maxUnderrunRatio: numberEnv("PROBE_MAX_UNDERRUN_RATIO", 0.02, 0, 1),
  consecutiveFailuresToStop: integerEnv("PROBE_STOP_FAILURES", 2, 1, 5),
  maxPreflightFailures: integerEnv("PROBE_MAX_PREFLIGHT_FAILURES", 80, 1, 1_000),
  progressIntervalMs: integerEnv("PROBE_PROGRESS_INTERVAL_MS", 10_000, 1_000, 60_000),
  batchMaxSegments: integerEnv("PROBE_BATCH_MAX_SEGMENTS", 10, 1, 30),
  batchSwitchDelayMs: integerEnv("PROBE_BATCH_SWITCH_DELAY_MS", 750, 0, 30_000),
  batchMinimumRevisitMs: integerEnv("PROBE_BATCH_MIN_REVISIT_MS", 500, 0, 60_000),
  batchFailureBackoffMs: integerEnv("PROBE_BATCH_FAILURE_BACKOFF_MS", 2_000, 100, 60_000),
  traceRequests: booleanEnv("PROBE_TRACE_REQUESTS", false),
  traceChannelIndex: integerEnv("PROBE_TRACE_CHANNEL_INDEX", 0, 0, 199),
  seed: integerEnv("PROBE_SEED", 20_260_828, 1, 0xffff_ffff),
};
const requestedNValues = listEnv("PROBE_N_VALUES", 1, config.maxChannels);

const credentials = await readCredentials();
const providerHost = new URL(credentials.baseUrl).host;
const client = new SerializedHttpClient({ timeoutMs: config.requestTimeoutMs });

console.log(`Provider: ${providerHost}`);
console.log("Loading account metadata and live-channel catalog...");

let accountPayload;
let catalogPayload;
try {
  accountPayload = await client.json(makeApiUrl(credentials), { kind: "api" });
  catalogPayload = await client.json(makeApiUrl(credentials, "get_live_streams"), {
    kind: "api",
  });
} catch (error) {
  fail(`Could not load provider catalog: ${error.message}`);
}

if (!Array.isArray(catalogPayload)) fail("Provider live-channel catalog was not an array.");
const channels = uniqueChannels(catalogPayload);
if (channels.length < 2) fail("Provider returned fewer than two distinct live channels.");

const account = summarizeAccount(accountPayload);
console.log(
  `Catalog: ${channels.length.toLocaleString()} distinct live channels; account max_connections=${account.maxConnections}.`,
);
console.log(
  `Policy: strategy=${config.strategy}, one active HTTP request globally; ` +
    `${config.warmupSeconds}s warm-up + ${config.stageSeconds}s measurement per n.`,
);

const probe = new AdaptiveHlsTimesliceProbe({
  credentials,
  channels,
  client,
  config,
  onProgress: printProgress,
});

const stages = [];
let consecutiveFailures = 0;
for (const n of requestedNValues || growthSequence(config.maxChannels)) {
  const result = await probe.runStage(n);
  stages.push(result);
  if (result.passed) consecutiveFailures = 0;
  else consecutiveFailures += 1;
  if (result.unavailable || consecutiveFailures >= config.consecutiveFailuresToStop) break;
}

const completedAt = new Date();
const report = {
  schemaVersion: 1,
  generatedAt: completedAt.toISOString(),
  providerHost,
  account,
  catalogChannels: channels.length,
  validatedChannels: probe.validatedChannels.length,
  rejectedChannels: probe.rejectedChannels.length,
  maxObservedActiveRequests: client.maxActiveRequests,
  config,
  stages,
};

const reportDir = resolve(process.env.PROBE_REPORT_DIR || "docs");
mkdirSync(reportDir, { recursive: true });
const timestamp = completedAt.toISOString().replace(/[:.]/g, "-");
const strategySlug = config.strategy.replaceAll("-", "_");
const markdownPath = resolve(
  reportDir,
  `hls-timeslicing-${strategySlug}-report-${timestamp}.md`,
);
const jsonPath = resolve(
  reportDir,
  `hls-timeslicing-${strategySlug}-results-${timestamp}.json`,
);
writeFileSync(markdownPath, renderMarkdownReport(report), { mode: 0o600 });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

console.log(`\nMarkdown report: ${markdownPath}`);
console.log(`Redacted raw results: ${jsonPath}`);
console.log(
  `Maximum passing n: ${maximumPassingN(stages)}; maximum active requests observed: ${client.maxActiveRequests}.`,
);

function printProgress(event) {
  if (event.type === "preflight") {
    const verdict = event.accepted ? "accepted" : "rejected";
    console.log(
      `Preflight ${verdict}: ${sanitizeLabel(event.channelName)} ` +
        `(usable=${event.acceptedCount}, rejected=${event.rejectedCount})`,
    );
    return;
  }
  if (event.type === "stage-start") {
    console.log(`\nStarting n=${event.n}...`);
    return;
  }
  if (event.type === "stage-progress") {
    console.log(
      `n=${event.n} ${event.phase}: ${event.remainingSeconds}s left, ` +
        `buffer=${event.minBufferSeconds.toFixed(1)}-${event.maxBufferSeconds.toFixed(1)}s, ` +
        `request errors=${percent(event.summary.requestErrorRate)}`,
    );
    return;
  }
  if (event.type === "stage-complete") {
    const result = event.result;
    console.log(
      `n=${result.n} ${result.passed ? "PASS" : "FAIL"}: ` +
        `request errors=${percent(result.requestErrorRate)}, ` +
        `segment errors=${percent(result.segmentErrorRate)}, ` +
        `underrun=${percent(result.underrunRatio)}, ` +
        `p95 J=${result.segmentFetchP95Ms.toFixed(0)}ms.`,
    );
  }
}

function renderMarkdownReport(report) {
  const maxPassing = maximumPassingN(report.stages);
  const providerConclusion = renderProviderConclusion(report, maxPassing);
  const firstFailure = report.stages.find((stage) => !stage.passed);
  const passingSummary =
    maxPassing > 0
      ? `The largest tested channel count that met every configured quality threshold was **n=${maxPassing}**.`
      : "**No tested channel count met every configured quality threshold.**";
  const stoppedBecause = firstFailure
    ? `Testing encountered a quality failure beginning at n=${firstFailure.n}.`
    : `Every tested value through n=${report.config.maxChannels} passed.`;
  const rows = report.stages
    .map((stage) => {
      if (stage.unavailable) {
        return `| ${stage.n} | UNAVAILABLE | — | — | — | — | — | — | — | ${escapeTable(stage.reason)} |`;
      }
      return (
        `| ${stage.n} | ${stage.passed ? "PASS" : "FAIL"} | ` +
        `${stage.requests} | ${percent(stage.requestErrorRate)} | ` +
        `${stage.segments} | ${percent(stage.segmentErrorRate)} | ` +
        `${percent(stage.underrunRatio)} | ${stage.channelsWithUnderruns}/${stage.n} | ` +
        `${stage.segmentFetchP50Ms.toFixed(0)} / ${stage.segmentFetchP95Ms.toFixed(0)} | ` +
        `${escapeTable(formatStatusCounts(stage.statusCounts) || stage.reason)} |`
      );
    })
    .join("\n");
  const stageDetails = report.stages
    .filter((stage) => !stage.unavailable)
    .map(
      (stage) =>
        `### n=${stage.n}: ${stage.passed ? "PASS" : "FAIL"}\n\n` +
        `- Measurement duration: ${stage.measuredSeconds.toFixed(1)} seconds\n` +
        `- Playing at end: ${stage.channelsPlaying}/${stage.n}\n` +
        `- Aggregate buffer-underrun time: ${stage.totalUnderrunSeconds.toFixed(2)} seconds ` +
        `(${percent(stage.underrunRatio)})\n` +
        `- Segment duration K (average): ${stage.averageSegmentDurationSeconds.toFixed(3)} seconds\n` +
        `- Segment fetch J: p50=${stage.segmentFetchP50Ms.toFixed(1)} ms, ` +
        `p95=${stage.segmentFetchP95Ms.toFixed(1)} ms\n` +
        `- Formula-only capacity floor(K×1000/Jp95): ${stage.idealChannelsAtP95}\n` +
        `- Ending buffer: minimum=${stage.minimumEndingBufferSeconds.toFixed(2)} seconds, ` +
        `average=${stage.averageEndingBufferSeconds.toFixed(2)} seconds\n` +
        `- Failed checks: ${stage.passed ? "none" : stage.reason}\n` +
        `- Failed-request breakdown: ${formatStatusCounts(stage.statusCounts) || "none"}`,
    )
    .join("\n\n");
  const traceDetails = renderRequestTraces(report.stages);

  return `# Serialized HLS Time-Slicing Capacity Report

**Generated:** ${report.generatedAt}  
**Provider host:** ${report.providerHost}  
**Security:** Credentials, authenticated URLs, tokens, and segment addresses are excluded.

## Executive summary

${passingSummary} ${stoppedBecause}

The probe used the **${report.config.strategy}** strategy and observed at most **${report.maxObservedActiveRequests} active HTTP request** at a time. This verifies that the experiment serialized provider, manifest, key, and segment requests instead of testing ordinary simultaneous downloads.

The account API reported \`max_connections=${report.account.maxConnections}\` and \`active_cons=${report.account.activeConnectionsAtStart}\` at startup. The catalog contained ${report.catalogChannels.toLocaleString()} distinct live channels. ${report.validatedChannels} channels passed an individual HLS manifest-and-segment preflight; ${report.rejectedChannels} candidates were rejected during the tested run.

## Pass criteria

A stage passed only when all channels initialized and reached playback, the measurement request-error rate was at most ${percent(report.config.maxRequestErrorRate)}, the segment-error rate was at most ${percent(report.config.maxSegmentErrorRate)}, and aggregate simulated buffer underruns were at most ${percent(report.config.maxUnderrunRatio)} of viewer-time.

Each stage used ${report.config.warmupSeconds} seconds of warm-up followed by ${report.config.stageSeconds} seconds of measurement. The player simulation began consuming media after buffering ${report.config.startupBufferSeconds} seconds. Stages stopped after ${report.config.consecutiveFailuresToStop} consecutive quality failures or after n=${report.config.maxChannels}.

In batch mode, every channel turn starts from a fresh authenticated root manifest, downloads all newly available segments consecutively (up to ${report.config.batchMaxSegments}), discards that channel token before switching, and selects the next channel by lowest remaining buffer.

## Results by n

| n | Result | Requests | Request error | Segment attempts | Segment error | Underrun | Channels with underrun | Segment J p50 / p95 ms | Errors / reason |
|---:|:---:|---:|---:|---:|---:|---:|---:|---:|---|
${rows}

## Stage details

${stageDetails || "No stages completed."}

${traceDetails}

## Interpretation

For segment duration K seconds and segment-fetch time J milliseconds, the optimistic serialized-slot capacity is:

\`floor((K × 1000) / J)\`

The report uses p95 J for its per-stage formula estimate. That estimate ignores manifest and key traffic, segment publication timing, token/session invalidation, retries, and safety margin. The observed passing n and buffer-underrun rate are therefore the meaningful results.

If the formula estimate is materially higher than the observed passing n while 401/403 responses or token refresh failures rise, the provider is probably enforcing authenticated channel/session state rather than counting only requests that are actively transferring bytes. If underruns rise without provider errors, serialized bandwidth or segment timing is the more likely limit.

## Conclusion for this provider

${providerConclusion}

## Limitations

- This downloads and buffers media segments but does not decode audio/video frames. It detects transport availability and timing, not codec corruption.
- Individually working channels were selected by deterministic shuffled preflight, so dead catalog entries do not dominate the concurrency result.
- A short staged test cannot prove long-term provider stability. Confirm the maximum passing n with a longer soak test before relying on it operationally.
- The test uses the highest-bandwidth HLS variant advertised by a master playlist, when variants are present.
`;
}

function renderRequestTraces(stages) {
  const traced = stages.filter((stage) => stage.requestTrace?.length > 0);
  if (traced.length === 0) return "";
  const sections = traced.map((stage) => {
    const rows = stage.requestTrace
      .map((request) => {
        const effective =
          request.responseUrl && request.responseUrl !== request.requestUrl
            ? request.responseUrl
            : "—";
        return (
          `| ${request.sequence} | ${request.startedAt} | ${request.phase} | ` +
          `${request.kind} | ${escapeTable(request.requestUrl)} | ${escapeTable(effective)} | ` +
          `${request.status || "—"} | ${request.ok ? "OK" : request.code} | ` +
          `${request.elapsedMs.toFixed(1)} |`
        );
      })
      .join("\n");
    return `## Sanitized request trace: n=${stage.n}

Channel: **${escapeTable(stage.tracedChannel.name)}** (stream id ${escapeTable(stage.tracedChannel.id)}). URLs retain the host and useful resource identity while credentials, token-bearing path components, and query values remain redacted.

| # | Started (UTC) | Phase | Type | Request URL | Effective URL | HTTP | Result | ms |
|---:|---|---|---|---|---|---:|---|---:|
${rows}`;
  });
  return sections.join("\n\n");
}

function renderProviderConclusion(report, maxPassing) {
  const baseline = report.stages.find((stage) => stage.n === 1 && !stage.unavailable);
  const failedStages = report.stages.filter((stage) => !stage.passed && !stage.unavailable);
  const authorizationFailureCount = failedStages.reduce(
    (total, stage) =>
      total +
      Number(stage.statusCounts?.["HTTP 401"] || 0) +
      Number(stage.statusCounts?.["HTTP 403"] || 0),
    0,
  );
  const authorizationBreakdown = formatAuthorizationFailures(failedStages);
  if (baseline && maxPassing === 1 && authorizationFailureCount > 0) {
    return (
      `The transfer-time arithmetic predicted about ${baseline.idealChannelsAtP95} channels from the n=1 ` +
      `K and p95 J measurements, but the observed quality limit was one channel. ` +
      `The failed multi-channel stages returned ${authorizationFailureCount} authorization failures ` +
      `(${authorizationBreakdown}) while the probe ` +
      `proved that at most one request was active. For this account, the provider therefore appears to ` +
      `enforce authenticated channel/session or token state rather than merely counting requests that are ` +
      `currently transferring. Time-slicing segment downloads does not provide reliable multi-channel ` +
      `capacity on this provider.`
    );
  }
  if (maxPassing === 0 && authorizationFailureCount > 0 && failedStages.length > 0) {
    const first = failedStages[0];
    return (
      `The requested n=${first.n} stage failed with ${percent(first.requestErrorRate)} request errors, ` +
      `${percent(first.underrunRatio)} simulated playback underrun, and ` +
      `${authorizationFailureCount} authorization failures (${authorizationBreakdown}), despite never ` +
      `overlapping requests. Its transfer-time formula estimate was ` +
      `${first.idealChannelsAtP95} channels, so serialized bandwidth was not the binding constraint. ` +
      `Fresh-manifest batching therefore does not achieve reliable n=${first.n} playback on this ` +
      `account; provider channel/session enforcement remains the limiting factor.`
    );
  }
  if (failedStages.length === 0) {
    return (
      `Every tested value passed, so the provider limit was not reached. The result supports time-slicing ` +
      `through n=${maxPassing}, but a higher maximum and longer soak are required to find the boundary.`
    );
  }
  return (
    `The largest passing value was n=${maxPassing}. Review the failed-request breakdown and buffer ` +
    `underruns above to distinguish provider enforcement from serialized bandwidth exhaustion.`
  );
}

function formatAuthorizationFailures(stages) {
  const unauthorized = stages.reduce(
    (total, stage) => total + Number(stage.statusCounts?.["HTTP 401"] || 0),
    0,
  );
  const forbidden = stages.reduce(
    (total, stage) => total + Number(stage.statusCounts?.["HTTP 403"] || 0),
    0,
  );
  return [`HTTP 401: ${unauthorized}`, `HTTP 403: ${forbidden}`].join(", ");
}

async function readCredentials() {
  const fromEnv = {
    baseUrl: process.env.XTREAM_URL?.trim(),
    username: process.env.XTREAM_USERNAME?.trim(),
    password: process.env.XTREAM_PASSWORD?.trim(),
  };
  if (fromEnv.baseUrl && fromEnv.username && fromEnv.password) {
    return normalizeCredentials(fromEnv);
  }
  if (!process.stdin.isTTY) {
    fail("Set XTREAM_URL, XTREAM_USERNAME, and XTREAM_PASSWORD, or run interactively.");
  }
  console.log("Credentials are read without echo and are never written to the report.");
  const baseUrl = await hiddenPrompt("Xtream URL: ");
  const username = await hiddenPrompt("Username: ");
  const password = await hiddenPrompt("Password: ");
  return normalizeCredentials({ baseUrl, username, password });
}

function normalizeCredentials(values) {
  let parsed;
  try {
    parsed = new URL(values.baseUrl);
  } catch {
    fail("Xtream URL is invalid.");
  }
  if (!/^https?:$/.test(parsed.protocol)) fail("Xtream URL must use HTTP or HTTPS.");
  if (!values.username || !values.password) fail("Username and password are required.");
  return {
    baseUrl: parsed.href.replace(/\/+$/, ""),
    username: values.username,
    password: values.password,
  };
}

function hiddenPrompt(label) {
  return new Promise((resolvePrompt, rejectPrompt) => {
    const input = process.stdin;
    let value = "";
    process.stdout.write(label);
    input.setRawMode?.(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          rejectPrompt(new Error("Interrupted."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolvePrompt(value.trim());
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode?.(false);
      input.pause();
    };
    input.on("data", onData);
  });
}

function uniqueChannels(rows) {
  const seen = new Set();
  const channels = [];
  for (const row of rows) {
    const id = String(row?.stream_id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    channels.push({ id, name: String(row?.name || `Stream ${id}`) });
  }
  return channels;
}

function maximumPassingN(stages) {
  return Math.max(0, ...stages.filter((stage) => stage.passed).map((stage) => stage.n));
}

function formatStatusCounts(counts) {
  return Object.entries(counts || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

function sanitizeLabel(value) {
  return String(value).replace(/[\r\n|]/g, " ").slice(0, 80);
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function integerEnv(name, fallback, min, max) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function numberEnv(name, fallback, min, max) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(`${name} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function enumEnv(name, fallback, choices) {
  const value = process.env[name]?.trim() || fallback;
  if (!choices.includes(value)) fail(`${name} must be one of: ${choices.join(", ")}.`);
  return value;
}

function listEnv(name, min, max) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const values = raw.split(",").map((value) => Number(value.trim()));
  if (
    values.length === 0 ||
    values.some((value) => !Number.isInteger(value) || value < min || value > max)
  ) {
    fail(`${name} must be a comma-separated list of integers between ${min} and ${max}.`);
  }
  return [...new Set(values)];
}

function booleanEnv(name, fallback) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  fail(`${name} must be true/false or 1/0.`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
