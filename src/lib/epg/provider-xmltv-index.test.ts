import { describe, expect, it } from "vitest";

import {
  decodeProviderXmltvSnapshot,
  encodeProviderXmltvSnapshot,
  matchesGuideSearch,
  providerGuideKey,
  resolveProviderGuideKey,
  searchProviderGuideDocuments,
  searchProviderGuideKeys,
  tokenizeGuideSearch,
  type ProviderXmltvIndex,
} from "@/lib/epg/provider-xmltv-index";

function searchIndex(postings: Record<string, string[]>): ProviderXmltvIndex {
  const guideKeys = [...new Set(Object.values(postings).flat())];
  const documentByGuideKey = new Map(guideKeys.map((key, index) => [key, index]));
  return {
    channelNames: new Map(),
    programmesByChannel: new Map(),
    channelNamesByGuideKey: new Map(),
    programmesByGuideKey: new Map(),
    guideChannels: new Map(
      guideKeys.map((key) => [
        key,
        {
          guideKey: key,
          epgId: key,
          searchText: "",
          channel: { name: key, url: key, duration: -1 },
        },
      ]),
    ),
    searchDocuments: guideKeys.map((guideKey) => ({ guideKey, programmeIndex: null })),
    searchPostings: new Map(Object.entries(postings).map(([token, keys]) => [
      token,
      keys.map((key) => documentByGuideKey.get(key)!),
    ])),
    searchTokens: Object.keys(postings).sort((a, b) => a.localeCompare(b)),
    fetchedAt: 1,
    version: "test",
    providerCount: 1,
    programmeCount: 0,
  };
}

describe("provider EPG search index", () => {
  it("keeps duplicate EPG ids isolated by provider", () => {
    expect(providerGuideKey("provider-a", "TSN.ca@feed")).not.toBe(
      providerGuideKey("provider-b", "TSN.ca@feed"),
    );
  });

  it("resolves provider-scoped tvg-id variants", () => {
    const index = searchIndex({ tennis: [providerGuideKey("provider-a", "TSN-CA")] });
    expect(resolveProviderGuideKey(index, "provider-a", "TSN.CA@feed")).toBe(
      providerGuideKey("provider-a", "TSN-CA"),
    );
    expect(resolveProviderGuideKey(index, "provider-b", "TSN.CA@feed")).toBeNull();
  });

  it("normalizes accents and matches word prefixes", () => {
    const terms = tokenizeGuideSearch("Québec ten");
    expect(terms).toEqual(["quebec", "ten"]);
    expect(matchesGuideSearch("Tennis live from Québec", terms)).toBe(true);
  });

  it("intersects token postings for fast multi-term searches", () => {
    const index = searchIndex({
      tennis: ["tsn", "sportsnet"],
      canada: ["tsn"],
      canadian: ["sportsnet"],
      news: ["cbc"],
    });
    expect([...searchProviderGuideKeys(index, "ten can")].sort()).toEqual([
      "sportsnet",
      "tsn",
    ]);
    expect([...searchProviderGuideKeys(index, "ten canada")]).toEqual(["tsn"]);
    expect([...searchProviderGuideKeys(index, "news")]).toEqual(["cbc"]);
  });

  it("requires exact matches for one and two character terms", () => {
    const index = searchIndex({ us: ["us-channel"], usa: ["usa-channel"] });
    expect([...searchProviderGuideKeys(index, "us")]).toEqual(["us-channel"]);
  });

  it("returns exact programme documents without a schedule scan", () => {
    const index = searchIndex({ tennis: ["tsn"] });
    index.searchDocuments.push({ guideKey: "tsn", programmeIndex: 7 });
    index.searchPostings.set("tennis", [0, 1]);

    const matches = searchProviderGuideDocuments(index, "tennis");
    expect(matches.channelKeys).toEqual(new Set(["tsn"]));
    expect(matches.programmeIndexesByGuideKey.get("tsn")).toEqual(new Set([7]));
  });

  it("round-trips the durable snapshot with Maps and search postings intact", () => {
    const index = searchIndex({ tennis: ["tsn"] });
    index.programmesByGuideKey.set("tsn", [
      {
        channelId: "tsn",
        title: "Tennis Live",
        description: "Centre court",
        startMs: 100,
        stopMs: 200,
      },
    ]);

    const restored = decodeProviderXmltvSnapshot(encodeProviderXmltvSnapshot(index));

    expect(restored?.guideChannels).toBeInstanceOf(Map);
    expect(restored?.searchPostings.get("tennis")).toEqual([0]);
    expect(restored?.programmesByGuideKey.get("tsn")?.[0]?.title).toBe("Tennis Live");
  });
});
