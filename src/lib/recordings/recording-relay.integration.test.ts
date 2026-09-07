import http from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as streamProxyGet } from "@/app/api/stream/proxy/[sessionId]/route";
import { createStreamSession } from "@/lib/stream/stream-session-store";
import {
  ZENDE_INTERNAL_RELAY_HEADER,
  internalRelayHeaderValue,
} from "@/lib/stream/internal-relay-request";
import { resetSharedStreamCacheForTests } from "@/lib/stream/shared-response-cache";
import { resetSharedRootPinsForTests } from "@/lib/stream/shared-root-pin-cache";
import { resetSharedManifestCacheForTests } from "@/lib/stream/shared-manifest-cache";

/** Minimal TS packet (188 bytes, sync 0x47). */
function ts188(): Buffer {
  const b = Buffer.alloc(188, 0xff);
  b[0] = 0x47;
  return b;
}

describe("recording relay (stream proxy + loopback origin)", () => {
  let server: http.Server;
  let upstreamPort: number;
  let oldPublicUrl: string | undefined;
  let redirectRootHits = 0;
  let edgeAHits = 0;
  let edgeBHits = 0;
  let edgeAAvailable = true;
  let segmentHits = 0;
  const progressiveRanges: Array<string | undefined> = [];

  beforeEach(() => {
    resetSharedManifestCacheForTests();
    resetSharedRootPinsForTests();
    resetSharedStreamCacheForTests();
  });

  beforeAll(async () => {
    oldPublicUrl = process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_APP_URL = "https://public.example.invalid";

    server = http.createServer((req, res) => {
      const u = req.url ?? "";
      if (u.startsWith("/live/test/test/77.m3u8")) {
        redirectRootHits++;
        res.writeHead(302, {
          Location: redirectRootHits === 1 ? "/edge-a/live.m3u8" : "/edge-b/live.m3u8",
        });
        res.end();
        return;
      }
      if (u.startsWith("/edge-a/live.m3u8")) {
        edgeAHits++;
        if (!edgeAAvailable) {
          res.writeHead(503);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
        res.end(["#EXTM3U", "#EXTINF:1.0,", "/seg0.ts", ""].join("\n"));
        return;
      }
      if (u.startsWith("/edge-b/live.m3u8")) {
        edgeBHits++;
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
        res.end(["#EXTM3U", "#EXTINF:1.0,", "/seg0.ts", ""].join("\n"));
        return;
      }
      if (u.startsWith("/main.m3u8")) {
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
        res.end(
          [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            "#EXT-X-STREAM-INF:BANDWIDTH=1000000",
            "sub.m3u8",
            "",
          ].join("\n"),
        );
        return;
      }
      if (u.startsWith("/sub.m3u8")) {
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
        res.end(
          [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            "#EXTINF:1.0,",
            "/seg0.ts",
            "#EXT-X-ENDLIST",
            "",
          ].join("\n"),
        );
        return;
      }
      if (u.startsWith("/seg0.ts")) {
        segmentHits++;
        res.writeHead(200, { "Content-Type": "video/mp2t" });
        res.end(ts188());
        return;
      }
      if (u.startsWith("/movie/test/test/99.mp4")) {
        const range = req.headers.range;
        progressiveRanges.push(range);
        const match = /^bytes=(\d+)-(\d*)$/.exec(range ?? "");
        const headers: Record<string, string> = {
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes",
          "Content-Length": "4",
        };
        if (match) {
          const end = match[2] || "999999999";
          headers["Content-Range"] =
            `bytes ${match[1]}-${end}/1000000000`;
        }
        res.writeHead(match ? 206 : 200, headers);
        res.end(Buffer.from([0, 0, 0, 0]));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("mock upstream bind failed");
    }
    upstreamPort = addr.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (oldPublicUrl === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = oldPublicUrl;
    }
  });

  it("bootstrap + child playlist keep loopback origin (PUBLIC_APP_URL ignored on loopback proxy)", async () => {
    const upstreamRoot = `http://127.0.0.1:${upstreamPort}/main.m3u8`;
    const sessionId = await createStreamSession({
      upstreamRootUrl: upstreamRoot,
      title: "vitest-recording",
    });

    const internal = {
      [ZENDE_INTERNAL_RELAY_HEADER]: internalRelayHeaderValue(),
    } as Record<string, string>;

    const boot = await streamProxyGet(
      new Request(`http://127.0.0.1:8077/api/stream/proxy/${sessionId}`, {
        headers: { host: "127.0.0.1:8077", ...internal },
      }),
      { params: Promise.resolve({ sessionId }) },
    );
    expect(boot.status).toBe(200);
    const body = await boot.text();
    expect(body).toContain("#EXTM3U");
    expect(body).toContain("http://127.0.0.1:8077/api/stream/proxy/");
    expect(body).not.toContain("public.example.invalid");

    /** First HTTP line in master is the media playlist (sub.m3u8), not a TS segment. */
    const childLine = body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("http://127.0.0.1:8077/api/stream/proxy/"));
    expect(childLine).toBeTruthy();
    const childUrl = new URL(childLine!);

    const child = await streamProxyGet(
      new Request(childUrl.href, {
        headers: { host: "127.0.0.1:8077" },
      }),
      { params: Promise.resolve({ sessionId }) },
    );
    expect(child.status).toBe(200);
    const childText = await child.text();
    expect(childText).toContain("#EXTM3U");
    expect(childText).toContain("http://127.0.0.1:8077/api/stream/proxy/");
    expect(childText).not.toContain("public.example.invalid");
  });

  it("segment fetch returns MPEG-TS bytes", async () => {
    const upstreamRoot = `http://127.0.0.1:${upstreamPort}/main.m3u8`;
    const sessionId = await createStreamSession({
      upstreamRootUrl: upstreamRoot,
      title: "vitest-seg",
      meta: { contentKind: "live" },
    });

    const internal = {
      [ZENDE_INTERNAL_RELAY_HEADER]: internalRelayHeaderValue(),
    } as Record<string, string>;

    const boot = await streamProxyGet(
      new Request(`http://127.0.0.1:8077/api/stream/proxy/${sessionId}`, {
        headers: { host: "127.0.0.1:8077", ...internal },
      }),
      { params: Promise.resolve({ sessionId }) },
    );
    const body = await boot.text();
    const subLine = body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("http://127.0.0.1:8077/api/stream/proxy/"));
    expect(subLine).toBeTruthy();

    const subRes = await streamProxyGet(
      new Request(subLine!, { headers: { host: "127.0.0.1:8077" } }),
      { params: Promise.resolve({ sessionId }) },
    );
    const subText = await subRes.text();
    const segLine = subText
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("http://127.0.0.1:8077/api/stream/proxy/"));
    expect(segLine).toBeTruthy();

    const segRes = await streamProxyGet(
      new Request(segLine!, { headers: { host: "127.0.0.1:8077" } }),
      { params: Promise.resolve({ sessionId }) },
    );
    expect(segRes.status).toBe(200);
    expect(segRes.headers.get("cache-control")).toBe("private, max-age=120");
    const buf = new Uint8Array(await segRes.arrayBuffer());
    expect(buf.length).toBe(188);
    expect(buf[0]).toBe(0x47);
  });

  it("preserves open-ended progressive seek ranges and response headers", async () => {
    progressiveRanges.length = 0;
    const upstreamRoot =
      `http://127.0.0.1:${upstreamPort}/movie/test/test/99.mp4`;
    const sessionId = await createStreamSession({
      upstreamRootUrl: upstreamRoot,
      title: "vitest-progressive",
    });

    const response = await streamProxyGet(
      new Request(
        `http://127.0.0.1:8077/api/stream/proxy/${sessionId}.mp4`,
        { headers: { Range: "bytes=400000000-" } },
      ),
      { params: Promise.resolve({ sessionId: `${sessionId}.mp4` }) },
    );

    expect(response.status).toBe(206);
    expect(progressiveRanges.at(-1)).toBe("bytes=400000000-");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range"))
      .toBe("bytes 400000000-999999999/1000000000");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Range");
    await response.arrayBuffer();
  });

  it("pins a redirected live playlist CDN and falls back to the provider origin", async () => {
    redirectRootHits = 0;
    edgeAHits = 0;
    edgeBHits = 0;
    edgeAAvailable = true;

    const upstreamRoot = `http://127.0.0.1:${upstreamPort}/live/test/test/77.m3u8`;
    const sessionId = await createStreamSession({
      upstreamRootUrl: upstreamRoot,
      title: "vitest-cdn-pin",
    });
    const requestUrl = `http://127.0.0.1:8077/api/stream/proxy/${sessionId}`;

    const first = await streamProxyGet(new Request(requestUrl), {
      params: Promise.resolve({ sessionId }),
    });
    expect(first.status).toBe(200);
    await first.text();
    expect(redirectRootHits).toBe(1);
    expect(edgeAHits).toBe(1);

    const second = await streamProxyGet(new Request(requestUrl), {
      params: Promise.resolve({ sessionId }),
    });
    expect(second.status).toBe(200);
    await second.text();
    expect(redirectRootHits).toBe(1);
    expect(edgeAHits).toBe(1);

    edgeAAvailable = false;
    resetSharedManifestCacheForTests();
    const recovered = await streamProxyGet(new Request(requestUrl), {
      params: Promise.resolve({ sessionId }),
    });
    expect(recovered.status).toBe(200);
    await recovered.text();
    expect(edgeAHits).toBe(2);
    expect(redirectRootHits).toBe(2);
    expect(edgeBHits).toBe(1);
  });

  it("coalesces the same segment across independent playback sessions", async () => {
    redirectRootHits = 0;
    edgeAHits = 0;
    edgeBHits = 0;
    edgeAAvailable = true;
    segmentHits = 0;

    const upstreamRoot = `http://127.0.0.1:${upstreamPort}/live/test/test/77.m3u8`;
    const sessionA = await createStreamSession({ upstreamRootUrl: upstreamRoot, title: "tab-a" });
    const rootA = await streamProxyGet(
      new Request(`http://127.0.0.1:8077/api/stream/proxy/${sessionA}`),
      { params: Promise.resolve({ sessionId: sessionA }) },
    );
    const rootAText = await rootA.text();

    const sessionB = await createStreamSession({ upstreamRootUrl: upstreamRoot, title: "tab-b" });
    const rootB = await streamProxyGet(
      new Request(`http://127.0.0.1:8077/api/stream/proxy/${sessionB}`),
      { params: Promise.resolve({ sessionId: sessionB }) },
    );
    const rootBText = await rootB.text();

    expect(redirectRootHits).toBe(1);
    const segmentUrlA = rootAText.split("\n").find((line) => line.includes("?h="));
    const segmentUrlB = rootBText.split("\n").find((line) => line.includes("?h="));
    expect(segmentUrlA).toBeTruthy();
    expect(segmentUrlB).toBeTruthy();

    const [segmentA, segmentB] = await Promise.all([
      streamProxyGet(new Request(segmentUrlA!), {
        params: Promise.resolve({ sessionId: sessionA }),
      }),
      streamProxyGet(new Request(segmentUrlB!), {
        params: Promise.resolve({ sessionId: sessionB }),
      }),
    ]);
    const [bytesA, bytesB] = await Promise.all([
      segmentA.arrayBuffer(),
      segmentB.arrayBuffer(),
    ]);

    expect(bytesA.byteLength).toBe(188);
    expect(bytesB.byteLength).toBe(188);
    expect(segmentHits).toBe(1);
    expect([segmentA.headers.get("x-zende-cache-status"), segmentB.headers.get("x-zende-cache-status")].sort())
      .toEqual(["COALESCED", "MISS"]);
    expect(segmentA.headers.get("x-zende-cache-id")).toBeTruthy();
    expect(segmentA.headers.get("x-zende-cache-id")).toBe(
      segmentB.headers.get("x-zende-cache-id"),
    );

    const replayed = await streamProxyGet(new Request(segmentUrlB!), {
      params: Promise.resolve({ sessionId: sessionB }),
    });
    expect(replayed.status).toBe(200);
    expect(replayed.headers.get("x-zende-cache-status")).toBe("HIT");
    expect(replayed.headers.get("x-zende-cache-id")).toBe(
      segmentA.headers.get("x-zende-cache-id"),
    );
    expect((await replayed.arrayBuffer()).byteLength).toBe(188);
    expect(segmentHits).toBe(1);
  });

  it("coalesces simultaneous rotating-token bootstraps across playback sessions", async () => {
    redirectRootHits = 0;
    edgeAHits = 0;
    edgeAAvailable = true;

    const upstreamRoot = `http://127.0.0.1:${upstreamPort}/live/test/test/77.m3u8`;
    const [sessionA, sessionB] = await Promise.all([
      createStreamSession({ upstreamRootUrl: upstreamRoot, title: "browser-a" }),
      createStreamSession({ upstreamRootUrl: upstreamRoot, title: "browser-b" }),
    ]);

    const [rootA, rootB] = await Promise.all([
      streamProxyGet(
        new Request(`http://127.0.0.1:8077/api/stream/proxy/${sessionA}`),
        { params: Promise.resolve({ sessionId: sessionA }) },
      ),
      streamProxyGet(
        new Request(`http://127.0.0.1:8077/api/stream/proxy/${sessionB}`),
        { params: Promise.resolve({ sessionId: sessionB }) },
      ),
    ]);

    expect(rootA.status).toBe(200);
    expect(rootB.status).toBe(200);
    await Promise.all([rootA.text(), rootB.text()]);
    expect(redirectRootHits).toBe(1);
    expect(edgeAHits).toBe(1);
  });
});
