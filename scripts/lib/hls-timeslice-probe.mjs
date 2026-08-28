import { performance } from "node:perf_hooks";

const DEFAULT_USER_AGENT = "Zende serialized HLS capacity probe";

export class ProbeRequestError extends Error {
  constructor(message, { status = 0, code = "REQUEST_FAILED" } = {}) {
    super(message);
    this.name = "ProbeRequestError";
    this.status = status;
    this.code = code;
  }
}

export class StageMetrics {
  constructor() {
    this.phase = "setup";
    this.requests = [];
    this.segments = [];
    this.initializationFailures = 0;
  }

  setPhase(phase) {
    this.phase = phase;
  }

  recordRequest(record) {
    this.requests.push({ phase: this.phase, ...record });
  }

  recordSegment(record) {
    this.segments.push({ phase: this.phase, ...record });
  }

  summarize(phase = "measurement") {
    const requests = this.requests.filter((item) => item.phase === phase);
    const segments = this.segments.filter((item) => item.phase === phase);
    const failedRequests = requests.filter((item) => !item.ok);
    const failedSegments = segments.filter((item) => !item.ok);
    const successfulSegments = segments.filter((item) => item.ok);
    const segmentLatencies = successfulSegments.map((item) => item.elapsedMs);
    const segmentDurations = successfulSegments.map((item) => item.durationSeconds);

    return {
      requests: requests.length,
      requestFailures: failedRequests.length,
      requestErrorRate: ratio(failedRequests.length, requests.length),
      segments: segments.length,
      segmentFailures: failedSegments.length,
      segmentErrorRate: ratio(failedSegments.length, segments.length),
      segmentFetchP50Ms: percentile(segmentLatencies, 0.5),
      segmentFetchP95Ms: percentile(segmentLatencies, 0.95),
      averageSegmentDurationSeconds: average(segmentDurations),
      downloadedBytes: successfulSegments.reduce(
        (total, item) => total + item.bytes,
        0,
      ),
      statusCounts: countBy(failedRequests, (item) =>
        item.status > 0 ? `HTTP ${item.status}` : item.code,
      ),
      requestKindCounts: countBy(requests, (item) => item.kind),
    };
  }
}

export class SerializedHttpClient {
  constructor({ timeoutMs = 20_000, maxBodyBytes = 64 * 1024 * 1024 } = {}) {
    this.timeoutMs = timeoutMs;
    this.maxBodyBytes = maxBodyBytes;
    this.activeRequests = 0;
    this.maxActiveRequests = 0;
    this.totalRequests = 0;
  }

  async request(
    url,
    { kind, metrics, accept = "*/*", channelId = "", channelName = "" },
  ) {
    if (this.activeRequests !== 0) {
      throw new Error("SerializedHttpClient received overlapping requests.");
    }

    this.activeRequests += 1;
    this.maxActiveRequests = Math.max(
      this.maxActiveRequests,
      this.activeRequests,
    );
    this.totalRequests += 1;
    const started = performance.now();
    const startedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status = 0;
    let responseUrl = "";

    try {
      const response = await fetch(url, {
        headers: {
          Accept: accept,
          "User-Agent": DEFAULT_USER_AGENT,
        },
        redirect: "follow",
        signal: controller.signal,
      });
      status = response.status;
      responseUrl = response.url;
      if (!response.ok) {
        throw new ProbeRequestError(`Provider returned HTTP ${status}.`, {
          status,
          code: "HTTP_ERROR",
        });
      }

      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > this.maxBodyBytes) {
        throw new ProbeRequestError("Response exceeded the probe body limit.", {
          status,
          code: "BODY_TOO_LARGE",
        });
      }

      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > this.maxBodyBytes) {
        throw new ProbeRequestError("Response exceeded the probe body limit.", {
          status,
          code: "BODY_TOO_LARGE",
        });
      }

      const elapsedMs = performance.now() - started;
      metrics?.recordRequest({
        kind,
        channelId,
        channelName,
        startedAt,
        completedAt: new Date().toISOString(),
        requestUrl: sanitizeTraceUrl(url),
        responseUrl: sanitizeTraceUrl(responseUrl),
        ok: true,
        status,
        code: "OK",
        elapsedMs,
        bytes: body.byteLength,
      });
      return {
        body,
        elapsedMs,
        responseUrl: response.url,
        status,
      };
    } catch (cause) {
      const elapsedMs = performance.now() - started;
      const error = normalizeRequestError(cause, status, controller.signal.aborted);
      metrics?.recordRequest({
        kind,
        channelId,
        channelName,
        startedAt,
        completedAt: new Date().toISOString(),
        requestUrl: sanitizeTraceUrl(url),
        responseUrl: responseUrl ? sanitizeTraceUrl(responseUrl) : "",
        ok: false,
        status: error.status,
        code: error.code,
        elapsedMs,
        bytes: 0,
      });
      throw error;
    } finally {
      clearTimeout(timer);
      this.activeRequests -= 1;
    }
  }

  async json(url, options) {
    const response = await this.request(url, {
      ...options,
      accept: "application/json,*/*",
    });
    try {
      return JSON.parse(new TextDecoder().decode(response.body));
    } catch {
      throw new ProbeRequestError("Provider response was not valid JSON.", {
        status: response.status,
        code: "INVALID_JSON",
      });
    }
  }
}

export class HlsChannelState {
  constructor({ channel, rootUrl, client, startupBufferSeconds }) {
    this.channel = channel;
    this.rootUrl = rootUrl;
    this.client = client;
    this.startupBufferSeconds = startupBufferSeconds;
    this.playlistUrl = rootUrl;
    this.targetDurationSeconds = 6;
    this.queue = [];
    this.knownSegmentIds = new Set();
    this.fetchedKeys = new Set();
    this.fetchedMaps = new Set();
    this.bufferSeconds = 0;
    this.playing = false;
    this.lastBufferUpdateMs = Date.now();
    this.nextManifestPollMs = 0;
    this.nextRetryMs = 0;
    this.measurementActive = false;
    this.underrunSeconds = 0;
    this.underrunEvents = 0;
    this.wasUnderrunning = false;
    this.startedDuringMeasurement = false;
  }

  async bootstrap(metrics, { initial = true } = {}) {
    let nextUrl = this.rootUrl;
    for (let depth = 0; depth < 4; depth += 1) {
      const loaded = await this.loadPlaylist(nextUrl, metrics, "manifest");
      if (loaded.playlist.type === "media") {
        this.playlistUrl = loaded.responseUrl;
        this.ingestMediaPlaylist(loaded.playlist, { initial });
        return;
      }

      const variant = selectVariant(loaded.playlist.variants);
      if (!variant) {
        throw new ProbeRequestError("HLS master playlist had no variants.", {
          code: "EMPTY_MASTER",
        });
      }
      nextUrl = variant.url;
    }
    throw new ProbeRequestError("HLS master playlist nesting was too deep.", {
      code: "MASTER_DEPTH",
    });
  }

  async refreshPlaylist(metrics) {
    try {
      const loaded = await this.loadPlaylist(this.playlistUrl, metrics, "manifest");
      if (loaded.playlist.type === "master") {
        const variant = selectVariant(loaded.playlist.variants);
        if (!variant) throw new ProbeRequestError("Empty HLS master playlist.");
        const media = await this.loadPlaylist(variant.url, metrics, "manifest");
        if (media.playlist.type !== "media") {
          throw new ProbeRequestError("HLS variant did not resolve to media.", {
            code: "INVALID_VARIANT",
          });
        }
        this.playlistUrl = media.responseUrl;
        this.ingestMediaPlaylist(media.playlist, { initial: false });
      } else {
        this.playlistUrl = loaded.responseUrl;
        this.ingestMediaPlaylist(loaded.playlist, { initial: false });
      }
    } catch (error) {
      if (error instanceof ProbeRequestError && [401, 403, 404].includes(error.status)) {
        this.playlistUrl = this.rootUrl;
      }
      this.nextRetryMs = Date.now() + 750;
      throw error;
    }
  }

  async fetchNextSegment(metrics) {
    const segment = this.queue[0];
    if (!segment) return false;

    try {
      if (segment.mapUrl && !this.fetchedMaps.has(segment.mapUrl)) {
        await this.client.request(segment.mapUrl, {
          kind: "map",
          metrics,
          ...this.channelTraceContext(),
        });
        this.fetchedMaps.add(segment.mapUrl);
      }
      if (segment.keyUrl && !this.fetchedKeys.has(segment.keyUrl)) {
        await this.client.request(segment.keyUrl, {
          kind: "key",
          metrics,
          ...this.channelTraceContext(),
        });
        this.fetchedKeys.add(segment.keyUrl);
      }

      const response = await this.client.request(segment.url, {
        kind: "segment",
        metrics,
        accept: "video/mp2t,video/mp4,audio/*,*/*",
        ...this.channelTraceContext(),
      });
      if (response.body.byteLength === 0) {
        throw new ProbeRequestError("Provider returned an empty segment.", {
          status: response.status,
          code: "EMPTY_SEGMENT",
        });
      }

      this.queue.shift();
      this.bufferSeconds += segment.durationSeconds;
      if (!this.playing && this.bufferSeconds >= this.startupBufferSeconds) {
        this.playing = true;
        if (this.measurementActive) this.startedDuringMeasurement = true;
      }
      metrics.recordSegment({
        ok: true,
        status: response.status,
        code: "OK",
        elapsedMs: response.elapsedMs,
        bytes: response.body.byteLength,
        durationSeconds: segment.durationSeconds,
      });
      this.nextRetryMs = 0;
      return true;
    } catch (error) {
      segment.attempts += 1;
      metrics.recordSegment({
        ok: false,
        status: error instanceof ProbeRequestError ? error.status : 0,
        code: error instanceof ProbeRequestError ? error.code : "SEGMENT_FAILED",
        elapsedMs: 0,
        bytes: 0,
        durationSeconds: segment.durationSeconds,
      });
      if (segment.attempts >= 2) this.queue.shift();
      if (error instanceof ProbeRequestError && [401, 403, 404].includes(error.status)) {
        this.playlistUrl = this.rootUrl;
        this.queue.length = 0;
        this.nextManifestPollMs = 0;
      }
      this.nextRetryMs = Date.now() + 750;
      throw error;
    }
  }

  updateBuffer(nowMs) {
    const elapsedSeconds = Math.max(0, nowMs - this.lastBufferUpdateMs) / 1000;
    this.lastBufferUpdateMs = nowMs;
    if (elapsedSeconds === 0) return;

    let underrunSeconds = 0;
    if (this.playing) {
      const consumed = Math.min(this.bufferSeconds, elapsedSeconds);
      this.bufferSeconds -= consumed;
      underrunSeconds = elapsedSeconds - consumed;
    } else if (this.measurementActive) {
      underrunSeconds = elapsedSeconds;
    }

    if (!this.measurementActive) return;
    if (underrunSeconds > 0) {
      this.underrunSeconds += underrunSeconds;
      if (!this.wasUnderrunning) this.underrunEvents += 1;
      this.wasUnderrunning = true;
    } else {
      this.wasUnderrunning = false;
    }
  }

  startMeasurement(nowMs) {
    this.updateBuffer(nowMs);
    this.measurementActive = true;
    this.underrunSeconds = 0;
    this.underrunEvents = 0;
    this.wasUnderrunning = !this.playing || this.bufferSeconds <= 0;
    this.startedDuringMeasurement = false;
    this.lastBufferUpdateMs = nowMs;
  }

  ingestMediaPlaylist(playlist, { initial }) {
    this.targetDurationSeconds = playlist.targetDurationSeconds || 6;
    const now = Date.now();
    this.nextManifestPollMs =
      now + Math.max(350, this.targetDurationSeconds * 450);

    if (initial) {
      for (const segment of playlist.segments) {
        this.knownSegmentIds.add(segment.identity);
      }
      const initialSegments = playlist.segments.slice(-2);
      for (const segment of initialSegments) {
        this.queue.push({ ...segment, attempts: 0 });
      }
      return;
    }

    for (const segment of playlist.segments) {
      if (this.knownSegmentIds.has(segment.identity)) continue;
      this.knownSegmentIds.add(segment.identity);
      this.queue.push({ ...segment, attempts: 0 });
    }
  }

  async loadPlaylist(url, metrics, kind) {
    const response = await this.client.request(url, {
      kind,
      metrics,
      accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
      ...this.channelTraceContext(),
    });
    const text = new TextDecoder().decode(response.body);
    return {
      playlist: parseM3u8(text, response.responseUrl),
      responseUrl: response.responseUrl,
    };
  }

  channelTraceContext() {
    return {
      channelId: this.channel.id,
      channelName: this.channel.name,
    };
  }
}

export class AdaptiveHlsTimesliceProbe {
  constructor({ credentials, channels, client, config, onProgress = () => {} }) {
    this.credentials = credentials;
    this.channels = seededShuffle(channels, config.seed);
    this.client = client;
    this.config = config;
    this.onProgress = onProgress;
    this.validatedChannels = [];
    this.rejectedChannels = [];
    this.nextCandidateIndex = 0;
  }

  async ensureValidatedChannels(count) {
    while (
      this.validatedChannels.length < count &&
      this.nextCandidateIndex < this.channels.length
    ) {
      const channel = this.channels[this.nextCandidateIndex];
      this.nextCandidateIndex += 1;
      const metrics = new StageMetrics();
      const state = this.createState(channel);
      try {
        await state.bootstrap(metrics);
        await state.fetchNextSegment(metrics);
        this.validatedChannels.push(channel);
        this.onProgress({
          type: "preflight",
          accepted: true,
          acceptedCount: this.validatedChannels.length,
          rejectedCount: this.rejectedChannels.length,
          channelName: channel.name,
        });
      } catch (error) {
        this.rejectedChannels.push({
          id: channel.id,
          name: channel.name,
          code: error instanceof ProbeRequestError ? error.code : "PREFLIGHT_FAILED",
          status: error instanceof ProbeRequestError ? error.status : 0,
        });
        this.onProgress({
          type: "preflight",
          accepted: false,
          acceptedCount: this.validatedChannels.length,
          rejectedCount: this.rejectedChannels.length,
          channelName: channel.name,
        });
      }

      if (
        this.rejectedChannels.length >= this.config.maxPreflightFailures &&
        this.validatedChannels.length === 0
      ) {
        break;
      }
    }

    return this.validatedChannels.length >= count;
  }

  async runStage(n) {
    const hasChannels = await this.ensureValidatedChannels(n);
    if (!hasChannels) {
      return {
        n,
        passed: false,
        reason: "Not enough individually validated HLS channels.",
        unavailable: true,
      };
    }

    const metrics = new StageMetrics();
    const states = this.validatedChannels.slice(0, n).map((channel) =>
      this.createState(channel),
    );

    metrics.setPhase("setup");
    if (this.config.strategy !== "batch") {
      for (const state of states) {
        try {
          await state.bootstrap(metrics);
        } catch {
          metrics.initializationFailures += 1;
        }
      }
    }

    this.onProgress({ type: "stage-start", n });
    metrics.setPhase("warmup");
    await this.runScheduler(states, metrics, this.config.warmupSeconds, n, "warmup");

    const measurementStartedMs = Date.now();
    for (const state of states) state.startMeasurement(measurementStartedMs);
    metrics.setPhase("measurement");
    await this.runScheduler(
      states,
      metrics,
      this.config.stageSeconds,
      n,
      "measurement",
    );
    const endedMs = Date.now();
    for (const state of states) state.updateBuffer(endedMs);

    const requestSummary = metrics.summarize("measurement");
    const measuredSeconds = Math.max(0.001, (endedMs - measurementStartedMs) / 1000);
    const totalUnderrunSeconds = states.reduce(
      (total, state) => total + state.underrunSeconds,
      0,
    );
    const underrunRatio = totalUnderrunSeconds / (measuredSeconds * n);
    const channelsWithUnderruns = states.filter(
      (state) => state.underrunSeconds > 0.05,
    ).length;
    const channelsPlaying = states.filter((state) => state.playing).length;
    const passChecks = {
      initialized: metrics.initializationFailures === 0,
      allPlaying: channelsPlaying === n,
      requestErrors:
        requestSummary.requestErrorRate <= this.config.maxRequestErrorRate,
      segmentErrors:
        requestSummary.segmentErrorRate <= this.config.maxSegmentErrorRate,
      underruns: underrunRatio <= this.config.maxUnderrunRatio,
      serialized: this.client.maxActiveRequests <= 1,
    };
    const passed = Object.values(passChecks).every(Boolean);
    const idealChannelsAtP95 =
      requestSummary.segmentFetchP95Ms > 0
        ? Math.floor(
            (requestSummary.averageSegmentDurationSeconds * 1000) /
              requestSummary.segmentFetchP95Ms,
          )
        : 0;
    const traceChannel = states[
      Math.min(this.config.traceChannelIndex || 0, states.length - 1)
    ];
    const requestTrace = this.config.traceRequests
      ? metrics.requests
          .filter(
            (request) =>
              request.channelId === traceChannel.channel.id &&
              (request.phase === "warmup" || request.phase === "measurement"),
          )
          .map((request, index) => ({ sequence: index + 1, ...request }))
      : undefined;

    const result = {
      n,
      passed,
      reason: passed
        ? "All configured quality thresholds passed."
        : Object.entries(passChecks)
            .filter(([, ok]) => !ok)
            .map(([name]) => name)
            .join(", "),
      unavailable: false,
      measuredSeconds,
      initializationFailures: metrics.initializationFailures,
      channelsPlaying,
      channelsWithUnderruns,
      totalUnderrunSeconds,
      underrunRatio,
      idealChannelsAtP95,
      passChecks,
      ...requestSummary,
      minimumEndingBufferSeconds: Math.min(
        ...states.map((state) => state.bufferSeconds),
      ),
      averageEndingBufferSeconds: average(
        states.map((state) => state.bufferSeconds),
      ),
      ...(requestTrace
        ? {
            tracedChannel: {
              id: traceChannel.channel.id,
              name: traceChannel.channel.name,
            },
            requestTrace,
          }
        : {}),
    };
    this.onProgress({ type: "stage-complete", result });
    return result;
  }

  async runScheduler(states, metrics, durationSeconds, n, phase) {
    if (this.config.strategy === "batch") {
      return this.runBatchScheduler(states, metrics, durationSeconds, n, phase);
    }

    const endMs = Date.now() + durationSeconds * 1000;
    let lastProgressMs = 0;

    while (Date.now() < endMs) {
      const now = Date.now();
      for (const state of states) state.updateBuffer(now);

      if (now - lastProgressMs >= this.config.progressIntervalMs) {
        lastProgressMs = now;
        this.onProgress({
          type: "stage-progress",
          n,
          phase,
          remainingSeconds: Math.max(0, Math.ceil((endMs - now) / 1000)),
          minBufferSeconds: Math.min(...states.map((state) => state.bufferSeconds)),
          maxBufferSeconds: Math.max(...states.map((state) => state.bufferSeconds)),
          summary: metrics.summarize(phase),
        });
      }

      const readySegments = states
        .filter((state) => state.queue.length > 0 && state.nextRetryMs <= now)
        .sort(compareChannelUrgency);
      if (readySegments.length > 0) {
        try {
          await readySegments[0].fetchNextSegment(metrics);
        } catch {
          // Failure is recorded; the scheduler continues serving other channels.
        }
        continue;
      }

      const readyManifests = states
        .filter(
          (state) =>
            state.queue.length === 0 &&
            state.nextRetryMs <= now &&
            state.nextManifestPollMs <= now,
        )
        .sort(compareChannelUrgency);
      if (readyManifests.length > 0) {
        try {
          const state = readyManifests[0];
          if (state.playlistUrl === state.rootUrl) {
            await state.bootstrap(metrics, { initial: false });
          } else {
            await state.refreshPlaylist(metrics);
          }
        } catch {
          // Failure is recorded; retry happens after the channel backoff.
        }
        continue;
      }

      const wakeAt = Math.min(
        endMs,
        ...states.map((state) =>
          Math.max(state.nextRetryMs, state.nextManifestPollMs || now + 100),
        ),
      );
      await delay(Math.max(20, Math.min(150, wakeAt - now)));
    }
  }

  async runBatchScheduler(states, metrics, durationSeconds, n, phase) {
    const endMs = Date.now() + durationSeconds * 1000;
    let lastProgressMs = 0;
    let lastSelected = null;

    while (Date.now() < endMs) {
      const now = Date.now();
      for (const state of states) state.updateBuffer(now);
      if (now - lastProgressMs >= this.config.progressIntervalMs) {
        lastProgressMs = now;
        this.onProgress({
          type: "stage-progress",
          n,
          phase,
          remainingSeconds: Math.max(0, Math.ceil((endMs - now) / 1000)),
          minBufferSeconds: Math.min(...states.map((state) => state.bufferSeconds)),
          maxBufferSeconds: Math.max(...states.map((state) => state.bufferSeconds)),
          summary: metrics.summarize(phase),
        });
      }

      const eligible = states
        .filter((state) => state.nextRetryMs <= now)
        .sort(compareChannelUrgency);
      if (eligible.length === 0) {
        const wakeAt = Math.min(endMs, ...states.map((state) => state.nextRetryMs));
        await delay(Math.max(20, Math.min(250, wakeAt - now)));
        continue;
      }

      let state = eligible[0];
      if (eligible.length > 1 && state === lastSelected) state = eligible[1];
      if (lastSelected !== null && state !== lastSelected) {
        await delay(this.config.batchSwitchDelayMs);
        for (const item of states) item.updateBuffer(Date.now());
      }

      // A provider that binds one account to its most recently requested
      // channel invalidates the previous CDN token. Start every turn from the
      // authenticated root and never spend a request polling a known-old token.
      state.queue.length = 0;
      state.playlistUrl = state.rootUrl;
      state.nextManifestPollMs = 0;
      let downloaded = 0;
      try {
        await state.bootstrap(metrics, { initial: false });
        while (
          state.queue.length > 0 &&
          downloaded < this.config.batchMaxSegments &&
          Date.now() < endMs
        ) {
          for (const item of states) item.updateBuffer(Date.now());
          const succeeded = await state.fetchNextSegment(metrics);
          if (succeeded) downloaded += 1;
        }
      } catch {
        // The request and any segment failure are already recorded.
      }

      // Any remaining URLs belong to the token being relinquished. The next
      // visit obtains a new manifest and discovers fresh sequence numbers.
      state.queue.length = 0;
      state.playlistUrl = state.rootUrl;
      state.nextRetryMs =
        Date.now() +
        (downloaded > 0
          ? this.config.batchMinimumRevisitMs
          : this.config.batchFailureBackoffMs);
      lastSelected = state;
    }
  }

  createState(channel) {
    return new HlsChannelState({
      channel,
      rootUrl: makeLiveUrl(this.credentials, channel.id, "m3u8"),
      client: this.client,
      startupBufferSeconds: this.config.startupBufferSeconds,
    });
  }
}

export function parseM3u8(text, responseUrl) {
  if (!text.trimStart().startsWith("#EXTM3U")) {
    throw new ProbeRequestError("Provider response was not an HLS playlist.", {
      code: "NOT_HLS",
    });
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const variants = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
    const attributes = parseAttributeList(lines[index].slice(lines[index].indexOf(":") + 1));
    const uri = nextUri(lines, index + 1);
    if (!uri) continue;
    variants.push({
      bandwidth: Number(attributes.BANDWIDTH || 0),
      resolution: attributes.RESOLUTION || "",
      url: new URL(uri, responseUrl).href,
    });
  }
  if (variants.length > 0) return { type: "master", variants };

  const mediaSequenceLine = lines.find((line) =>
    line.startsWith("#EXT-X-MEDIA-SEQUENCE:"),
  );
  const targetDurationLine = lines.find((line) =>
    line.startsWith("#EXT-X-TARGETDURATION:"),
  );
  const mediaSequence = Number(mediaSequenceLine?.split(":", 2)[1] || 0);
  const targetDurationSeconds = Number(targetDurationLine?.split(":", 2)[1] || 6);
  const segments = [];
  let durationSeconds = 0;
  let activeKeyUrl = null;
  let activeMapUrl = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("#EXT-X-KEY:")) {
      const attrs = parseAttributeList(line.slice(line.indexOf(":") + 1));
      activeKeyUrl =
        attrs.METHOD && attrs.METHOD !== "NONE" && attrs.URI
          ? new URL(unquote(attrs.URI), responseUrl).href
          : null;
      continue;
    }
    if (line.startsWith("#EXT-X-MAP:")) {
      const attrs = parseAttributeList(line.slice(line.indexOf(":") + 1));
      activeMapUrl = attrs.URI
        ? new URL(unquote(attrs.URI), responseUrl).href
        : null;
      continue;
    }
    if (!line.startsWith("#EXTINF:")) continue;
    durationSeconds = Number(line.slice(8).split(",", 1)[0]);
    const uri = nextUri(lines, index + 1);
    if (!uri || !Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;
    const url = new URL(uri, responseUrl).href;
    const sequence = mediaSequence + segments.length;
    const filename = new URL(url).pathname.split("/").filter(Boolean).at(-1) || url;
    segments.push({
      durationSeconds,
      identity: `${sequence}:${filename}`,
      keyUrl: activeKeyUrl,
      mapUrl: activeMapUrl,
      sequence,
      url,
    });
  }

  if (segments.length === 0) {
    throw new ProbeRequestError("HLS media playlist contained no segments.", {
      code: "EMPTY_MEDIA_PLAYLIST",
    });
  }
  return { type: "media", segments, targetDurationSeconds };
}

export function makeApiUrl(credentials, action) {
  const url = new URL("/player_api.php", credentials.baseUrl);
  url.searchParams.set("username", credentials.username);
  url.searchParams.set("password", credentials.password);
  if (action) url.searchParams.set("action", action);
  return url.href;
}

export function makeLiveUrl(credentials, streamId, extension = "m3u8") {
  return new URL(
    `/live/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${encodeURIComponent(streamId)}.${extension}`,
    credentials.baseUrl,
  ).href;
}

/** Preserve routing diagnostics without persisting credentials or CDN tokens. */
export function sanitizeTraceUrl(input) {
  try {
    const url = new URL(input);
    const parts = url.pathname.split("/");
    const liveIndex = parts.indexOf("live");
    if (liveIndex >= 0 && parts.length > liveIndex + 3) {
      parts[liveIndex + 1] = "***";
      parts[liveIndex + 2] = "***";
      return `${url.origin}${parts.join("/")}${url.search ? "?[redacted]" : ""}`;
    }

    if (url.pathname.endsWith("/player_api.php")) {
      for (const key of url.searchParams.keys()) {
        if (/^(?:username|password|token|auth|signature|sig|key)$/i.test(key)) {
          url.searchParams.set(key, "***");
        }
      }
      url.username = "";
      url.password = "";
      return url.href;
    }

    const filename = parts.filter(Boolean).at(-1) || "";
    const safePath = filename ? `/…/${filename}` : "/";
    return `${url.origin}${safePath}${url.search ? "?[redacted]" : ""}`;
  } catch {
    return "[invalid URL]";
  }
}

export function growthSequence(maxChannels) {
  const values = [1, 2, 4, 8].filter((value) => value <= maxChannels);
  for (let value = 12; value <= maxChannels; value += 4) values.push(value);
  if (!values.includes(maxChannels)) values.push(maxChannels);
  return [...new Set(values)].sort((a, b) => a - b);
}

export function summarizeAccount(payload) {
  const info = payload?.user_info || {};
  return {
    status: String(info.status || "unknown"),
    maxConnections: String(info.max_connections || "unknown"),
    activeConnectionsAtStart: String(info.active_cons || "unknown"),
    expiryTimestamp: String(info.exp_date || "unknown"),
  };
}

function selectVariant(variants) {
  return [...variants].sort((a, b) => b.bandwidth - a.bandwidth)[0] || null;
}

function compareChannelUrgency(a, b) {
  if (a.bufferSeconds !== b.bufferSeconds) return a.bufferSeconds - b.bufferSeconds;
  return a.nextManifestPollMs - b.nextManifestPollMs;
}

function parseAttributeList(value) {
  const attributes = {};
  const matcher = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
  for (const match of value.matchAll(matcher)) attributes[match[1]] = unquote(match[2]);
  return attributes;
}

function unquote(value) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function nextUri(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!lines[index]) continue;
    if (lines[index].startsWith("#")) return null;
    return lines[index];
  }
  return null;
}

function normalizeRequestError(cause, status, timedOut) {
  if (cause instanceof ProbeRequestError) return cause;
  if (timedOut) {
    return new ProbeRequestError("Provider request timed out.", {
      status,
      code: "TIMEOUT",
    });
  }
  return new ProbeRequestError("Provider request failed.", {
    status,
    code: cause?.cause?.code || cause?.code || "NETWORK_ERROR",
  });
}

function seededShuffle(values, seed) {
  const result = [...values];
  let state = Number(seed) >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}

function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function average(values) {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
