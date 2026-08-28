import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdaptiveHlsTimesliceProbe,
  SerializedHttpClient,
  StageMetrics,
  growthSequence,
  parseM3u8,
  sanitizeTraceUrl,
} from "./hls-timeslice-probe.mjs";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("parseM3u8", () => {
  it("resolves master variants and preserves their bandwidth", () => {
    const playlist = parseM3u8(
      `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080
/high/index.m3u8
`,
      "https://cdn.example.test/root/master.m3u8",
    );

    expect(playlist).toEqual({
      type: "master",
      variants: [
        {
          bandwidth: 800000,
          resolution: "640x360",
          url: "https://cdn.example.test/root/low/index.m3u8",
        },
        {
          bandwidth: 4000000,
          resolution: "1920x1080",
          url: "https://cdn.example.test/high/index.m3u8",
        },
      ],
    });
  });

  it("extracts media durations, keys, maps, and stable identities", () => {
    const playlist = parseM3u8(
      `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:101
#EXT-X-MAP:URI="init.mp4"
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:5.5,
segments/channel_101.m4s?token=secret
#EXTINF:6,
segments/channel_102.m4s?token=secret
`,
      "https://cdn.example.test/live/index.m3u8",
    );

    expect(playlist.type).toBe("media");
    expect(playlist.targetDurationSeconds).toBe(6);
    expect(playlist.segments).toHaveLength(2);
    expect(playlist.segments[0]).toEqual(
      expect.objectContaining({
        durationSeconds: 5.5,
        identity: "101:channel_101.m4s",
        keyUrl: "https://cdn.example.test/live/key.bin",
        mapUrl: "https://cdn.example.test/live/init.mp4",
        sequence: 101,
        url: "https://cdn.example.test/live/segments/channel_101.m4s?token=secret",
      }),
    );
  });
});

describe("SerializedHttpClient", () => {
  it("records successful requests without retaining URLs", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/mp2t" },
      }),
    );
    const metrics = new StageMetrics();
    const client = new SerializedHttpClient();

    const response = await client.request("https://user:password@example.test/segment.ts", {
      kind: "segment",
      metrics,
    });

    expect(response.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(client.maxActiveRequests).toBe(1);
    expect(metrics.requests).toEqual([
      expect.objectContaining({
        kind: "segment",
        ok: true,
        status: 200,
        bytes: 3,
      }),
    ]);
    expect(JSON.stringify(metrics)).not.toContain("password");
  });

  it("rejects overlapping requests", async () => {
    let release;
    globalThis.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Response("ok"));
        }),
    );
    const client = new SerializedHttpClient();
    const first = client.request("https://example.test/first", { kind: "test" });

    await expect(
      client.request("https://example.test/second", { kind: "test" }),
    ).rejects.toThrow("overlapping requests");
    release();
    await first;
  });
});

describe("growthSequence", () => {
  it("crosses thirty channels and includes a non-step maximum", () => {
    expect(growthSequence(34)).toEqual([1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 34]);
  });
});

describe("sanitizeTraceUrl", () => {
  it("redacts Xtream credentials while retaining the stream resource", () => {
    expect(
      sanitizeTraceUrl(
        "http://provider.example/live/real-user/real-password/12345.m3u8",
      ),
    ).toBe("http://provider.example/live/***/***/12345.m3u8");
  });

  it("redacts CDN path and query tokens while retaining the filename", () => {
    expect(
      sanitizeTraceUrl(
        "https://cdn.example/secret-token/random/channel_987.ts?token=secret",
      ),
    ).toBe("https://cdn.example/…/channel_987.ts?[redacted]");
  });
});

describe("AdaptiveHlsTimesliceProbe batch scheduler", () => {
  it("fetches a bounded batch and discards the token before switching", async () => {
    const metrics = new StageMetrics();
    let fetched = 0;
    let bootstraps = 0;
    const state = {
      bufferSeconds: 0,
      nextRetryMs: 0,
      nextManifestPollMs: 0,
      playlistUrl: "root",
      rootUrl: "root",
      queue: [],
      targetDurationSeconds: 10,
      updateBuffer() {},
      async bootstrap() {
        bootstraps += 1;
        this.playlistUrl = "fresh-token-playlist";
        this.queue.push({ id: 1 }, { id: 2 }, { id: 3 });
      },
      async fetchNextSegment() {
        this.queue.shift();
        fetched += 1;
        this.bufferSeconds += 10;
        return true;
      },
    };
    const probe = new AdaptiveHlsTimesliceProbe({
      credentials: {},
      channels: [],
      client: {},
      config: {
        strategy: "batch",
        seed: 1,
        progressIntervalMs: 60_000,
        batchMaxSegments: 2,
        batchSwitchDelayMs: 0,
        batchMinimumRevisitMs: 10_000,
        batchFailureBackoffMs: 10_000,
      },
    });

    await probe.runBatchScheduler([state], metrics, 0.04, 1, "warmup");

    expect(bootstraps).toBe(1);
    expect(fetched).toBe(2);
    expect(state.queue).toEqual([]);
    expect(state.playlistUrl).toBe("root");
  });
});
