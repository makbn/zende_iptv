import { describe, expect, it } from "vitest";

import {
  buildXmltvDocument,
  createXmltvImageProxyTransform,
  rewriteXmltvIconUrls,
} from "@/lib/iptv/xmltv-guide";

describe("XMLTV same-origin artwork", () => {
  it("writes supplied programme metadata against the generated channel id", () => {
    const xml = buildXmltvDocument(
      [{ cid: "zende-live-42", name: "TSN 1" }],
      "https://live.example.test",
      [{
        channelId: "zende-live-42",
        title: "US Open Tennis",
        description: "Live coverage",
        startMs: Date.UTC(2026, 7, 24, 18),
        stopMs: Date.UTC(2026, 7, 24, 20),
      }],
    );
    expect(xml).toContain('channel="zende-live-42"');
    expect(xml).toContain("<title lang=\"en\">US Open Tennis</title>");
    expect(xml).toContain("<desc lang=\"en\">Live coverage</desc>");
  });

  it("rewrites escaped provider icon URLs through Zende", () => {
    const xml = '<icon src="https://img.example.test/logo.png?a=1&amp;b=2" />';
    const rewritten = rewriteXmltvIconUrls(xml, "https://live.example.test");
    expect(rewritten).toContain("https://live.example.test/api/media/image/");
    expect(rewritten).not.toContain('src="https://img.example.test');
  });

  it("rewrites an icon even when the XML tag crosses stream chunks", async () => {
    const encoder = new TextEncoder();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('<channel><icon src="https://img.exam'));
        controller.enqueue(encoder.encode('ple.test/logo.png" /></channel>'));
        controller.close();
      },
    });
    const output = await new Response(
      source.pipeThrough(createXmltvImageProxyTransform("https://live.example.test")),
    ).text();
    expect(output).toContain("https://live.example.test/api/media/image/");
    expect(output).not.toContain("https://img.example.test/logo.png");
  });
});
