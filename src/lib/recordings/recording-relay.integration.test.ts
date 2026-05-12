import http from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as streamProxyGet } from "@/app/api/stream/proxy/[sessionId]/route";
import { createStreamSession } from "@/lib/stream/stream-session-store";
import {
  ZENDE_INTERNAL_RELAY_HEADER,
  ZENDE_INTERNAL_RELAY_HEADER_VALUE,
} from "@/lib/stream/internal-relay-request";

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

  beforeAll(async () => {
    oldPublicUrl = process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_APP_URL = "https://public.example.invalid";

    server = http.createServer((req, res) => {
      const u = req.url ?? "";
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
        res.writeHead(200, { "Content-Type": "video/mp2t" });
        res.end(ts188());
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
      [ZENDE_INTERNAL_RELAY_HEADER]: ZENDE_INTERNAL_RELAY_HEADER_VALUE,
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
    });

    const internal = {
      [ZENDE_INTERNAL_RELAY_HEADER]: ZENDE_INTERNAL_RELAY_HEADER_VALUE,
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
    const buf = new Uint8Array(await segRes.arrayBuffer());
    expect(buf.length).toBe(188);
    expect(buf[0]).toBe(0x47);
  });
});
