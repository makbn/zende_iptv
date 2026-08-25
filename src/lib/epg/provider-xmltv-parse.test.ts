import { describe, expect, it } from "vitest";

import {
  decodeXmltvText,
  parseProviderXmltvChannelBlock,
  parseProviderXmltvProgrammeBlock,
} from "@/lib/epg/provider-xmltv-parse";

describe("provider XMLTV parsing", () => {
  it("parses channel names and XML entities", () => {
    expect(
      parseProviderXmltvChannelBlock(
        '<channel id="tsn1.ca"><display-name>TSN &amp; One</display-name></channel>',
      ),
    ).toEqual({ id: "tsn1.ca", name: "TSN & One" });
    expect(decodeXmltvText("US Open &apos;Live&apos;")).toBe("US Open 'Live'");
  });

  it("parses full programme details regardless of attribute order", () => {
    expect(
      parseProviderXmltvProgrammeBlock(
        '<programme channel="tsn1.ca" stop="20260824190000 +0000" start="20260824170000 +0000"><title>US Open Tennis</title><desc>First round</desc></programme>',
      ),
    ).toEqual({
      channelId: "tsn1.ca",
      title: "US Open Tennis",
      description: "First round",
      startMs: Date.parse("2026-08-24T17:00:00+00:00"),
      stopMs: Date.parse("2026-08-24T19:00:00+00:00"),
    });
  });
});
