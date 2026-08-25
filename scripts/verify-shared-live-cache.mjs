#!/usr/bin/env node

import { createHash } from "node:crypto";

const origin = (process.env.ZENDE_CACHE_TEST_ORIGIN ?? "").replace(/\/$/, "");
const password = process.env.ZENDE_CACHE_TEST_PASSWORD ?? "";
const users = (process.env.ZENDE_CACHE_TEST_USERS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const channels = JSON.parse(process.env.ZENDE_CACHE_TEST_CHANNELS ?? "{}");
const sustainedSeconds = Number(process.env.ZENDE_CACHE_TEST_SECONDS ?? "310");
const combinationSeconds = Number(process.env.ZENDE_CACHE_COMBO_SECONDS ?? "40");
const pollMs = Number(process.env.ZENDE_CACHE_TEST_POLL_MS ?? "8000");

if (!origin || !password || users.length !== 4) {
  throw new Error(
    "Set ZENDE_CACHE_TEST_ORIGIN, ZENDE_CACHE_TEST_PASSWORD, and exactly four ZENDE_CACHE_TEST_USERS.",
  );
}
for (const required of ["tsn1", "tsn2", "tsn3", "tsn4", "tsn5"]) {
  if (typeof channels[required] !== "string" || channels[required].length < 8) {
    throw new Error(`Missing test channel: ${required}`);
  }
}
if (!Number.isFinite(sustainedSeconds) || sustainedSeconds < 300) {
  throw new Error("ZENDE_CACHE_TEST_SECONDS must be at least 300 seconds.");
}

const counters = () => ({
  HIT: 0,
  MISS: 0,
  COALESCED: 0,
  STALE: 0,
  BYPASS: 0,
  UNKNOWN: 0,
});

function increment(target, state) {
  const key = Object.hasOwn(target, state) ? state : "UNKNOWN";
  target[key] += 1;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 70_000) {
  return fetch(url, {
    ...options,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function login(username) {
  const response = await fetchWithTimeout(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();
  if (!response.ok || typeof data.accessToken !== "string") {
    throw new Error(`Login failed for ${username}: HTTP ${response.status}`);
  }
  return data.accessToken;
}

async function createSession(username, token, label, channelUrl) {
  const response = await fetchWithTimeout(`${origin}/api/stream/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: channelUrl,
      title: `cache-test ${label}`,
      group: "Zende shared-cache verification",
      meta: { contentKind: "live" },
    }),
  });
  const data = await response.json();
  if (!response.ok || typeof data.id !== "string") {
    throw new Error(
      `Session creation failed for ${username}/${label}: HTTP ${response.status}`,
    );
  }
  return { username, id: data.id };
}

function mediaUrls(manifest) {
  const lines = manifest.split(/\r?\n/).map((line) => line.trim());
  const urls = [];
  let expectsSegment = false;
  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      expectsSegment = true;
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    if (expectsSegment && /^https?:\/\//i.test(line)) urls.push(line);
    expectsSegment = false;
  }
  return urls;
}

function aliasIdentity(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("h") ?? parsed.searchParams.get("u") ?? parsed.href;
  } catch {
    return url;
  }
}

async function fetchManifest(session, result) {
  const response = await fetchWithTimeout(
    `${origin}/api/stream/proxy/${session.id}`,
    {},
    80_000,
  );
  result.rootRequests += 1;
  increment(result.rootCache, response.headers.get("x-zende-cache-status") ?? "UNKNOWN");
  if (!response.ok) {
    result.violations.push(`root ${session.username} HTTP ${response.status}`);
    await response.arrayBuffer();
    return new Map();
  }
  const body = await response.text();
  const out = new Map();
  for (const url of mediaUrls(body)) out.set(aliasIdentity(url), url);
  if (out.size === 0) {
    result.violations.push(`root ${session.username} contained no media segments`);
  }
  return out;
}

async function fetchSegment(url, session, result) {
  const response = await fetchWithTimeout(url, {}, 60_000);
  const bytes = Buffer.from(await response.arrayBuffer());
  const status = response.headers.get("x-zende-cache-status") ?? "UNKNOWN";
  const cacheId = response.headers.get("x-zende-cache-id") ?? "";
  result.segmentResponses += 1;
  result.segmentBytes += bytes.byteLength;
  increment(result.segmentCache, status);
  return {
    username: session.username,
    httpStatus: response.status,
    cacheStatus: status,
    cacheId,
    byteLength: bytes.byteLength,
    bodyHash: sha256(bytes),
  };
}

function checkSegmentGroup(label, identity, responses, result, globalCacheOwners) {
  result.segmentGroups += 1;
  const misses = responses.filter((item) => item.cacheStatus === "MISS").length;
  const cacheIds = new Set(responses.map((item) => item.cacheId).filter(Boolean));
  const hashes = new Set(responses.map((item) => item.bodyHash));
  const sizes = new Set(responses.map((item) => item.byteLength));
  const failures = responses.filter((item) => item.httpStatus !== 200);

  if (misses > 1) {
    result.violations.push(`${label}/${identity}: ${misses} upstream cache misses`);
  }
  if (cacheIds.size !== 1) {
    result.violations.push(`${label}/${identity}: cache IDs differed or were missing`);
  }
  if (hashes.size !== 1 || sizes.size !== 1) {
    result.violations.push(`${label}/${identity}: response bytes differed`);
  }
  if (failures.length > 0) {
    result.violations.push(
      `${label}/${identity}: non-200 responses for ${failures.map((item) => item.username).join(",")}`,
    );
  }

  const [cacheId] = cacheIds;
  if (cacheId) {
    const owner = globalCacheOwners.get(cacheId);
    if (owner && owner !== label) {
      result.violations.push(`${label}/${identity}: cache ID collided with ${owner}`);
    } else {
      globalCacheOwners.set(cacheId, label);
    }
  }
}

async function runCohort({ label, usernames, channelUrl, durationSeconds, tokens }, globalCacheOwners) {
  const sessions = await Promise.all(
    usernames.map((username) => createSession(username, tokens.get(username), label, channelUrl)),
  );
  const result = {
    label,
    users: usernames,
    durationRequestedSeconds: durationSeconds,
    durationActualSeconds: 0,
    rootRequests: 0,
    rootCache: counters(),
    segmentGroups: 0,
    segmentResponses: 0,
    segmentBytes: 0,
    segmentCache: counters(),
    violations: [],
  };
  const seen = new Set();
  const startedAt = Date.now();
  const deadline = startedAt + durationSeconds * 1000;

  while (Date.now() < deadline) {
    const manifests = await Promise.all(
      sessions.map((session) => fetchManifest(session, result)),
    );
    const orderedIdentities = [...manifests[0].keys()].filter(
      (identity) => !seen.has(identity) && manifests.every((manifest) => manifest.has(identity)),
    );

    for (const identity of orderedIdentities) {
      seen.add(identity);
      const responses = await Promise.all(
        sessions.map((session, index) =>
          fetchSegment(manifests[index].get(identity), session, result),
        ),
      );
      checkSegmentGroup(label, identity, responses, result, globalCacheOwners);
    }

    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    process.stdout.write(
      `PROGRESS ${label} elapsed=${elapsedSeconds}s roots=${result.rootRequests} ` +
        `segments=${result.segmentGroups} responses=${result.segmentResponses} ` +
        `cache=MISS:${result.segmentCache.MISS},HIT:${result.segmentCache.HIT},` +
        `COALESCED:${result.segmentCache.COALESCED} violations=${result.violations.length}\n`,
    );
    if (Date.now() < deadline) await delay(Math.min(pollMs, deadline - Date.now()));
  }

  result.durationActualSeconds = Math.floor((Date.now() - startedAt) / 1000);
  return result;
}

async function main() {
  process.stdout.write(`Authenticating ${users.length} independent users...\n`);
  const tokenEntries = await Promise.all(
    users.map(async (username) => [username, await login(username)]),
  );
  const tokens = new Map(tokenEntries);
  const globalCacheOwners = new Map();
  const results = [];

  results.push(
    await runCohort(
      {
        label: "tsn1-all-four",
        usernames: users,
        channelUrl: channels.tsn1,
        durationSeconds: sustainedSeconds,
        tokens,
      },
      globalCacheOwners,
    ),
  );

  const splitOne = await Promise.all([
    runCohort(
      {
        label: "tsn2-dev1-dev2",
        usernames: [users[0], users[1]],
        channelUrl: channels.tsn2,
        durationSeconds: combinationSeconds,
        tokens,
      },
      globalCacheOwners,
    ),
    runCohort(
      {
        label: "tsn3-dev3-dev4",
        usernames: [users[2], users[3]],
        channelUrl: channels.tsn3,
        durationSeconds: combinationSeconds,
        tokens,
      },
      globalCacheOwners,
    ),
  ]);
  results.push(...splitOne);

  const splitTwo = await Promise.all([
    runCohort(
      {
        label: "tsn4-dev1-dev3",
        usernames: [users[0], users[2]],
        channelUrl: channels.tsn4,
        durationSeconds: combinationSeconds,
        tokens,
      },
      globalCacheOwners,
    ),
    runCohort(
      {
        label: "tsn5-dev2-dev4",
        usernames: [users[1], users[3]],
        channelUrl: channels.tsn5,
        durationSeconds: combinationSeconds,
        tokens,
      },
      globalCacheOwners,
    ),
  ]);
  results.push(...splitTwo);

  const totalViolations = results.reduce((sum, result) => sum + result.violations.length, 0);
  process.stdout.write(`FINAL ${JSON.stringify({ totalViolations, results })}\n`);
  if (totalViolations > 0) process.exitCode = 1;
}

await main();
