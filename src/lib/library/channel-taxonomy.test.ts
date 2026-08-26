import { describe, expect, it } from "vitest";

import { deriveChannelTaxonomy } from "@/lib/library/channel-taxonomy";

describe("provider channel taxonomy", () => {
  it("recognizes bracketed English VOD categories", () => {
    expect(
      deriveChannelTaxonomy(
        { name: "EN| Example", groupTitle: "[EN] DRAMA/ROMANCE" },
        "movie",
      ),
    ).toMatchObject({
      categoryKey: "drama-romance",
      languageKey: "en",
    });
  });

  it("does not treat provider region buckets as languages", () => {
    expect(
      deriveChannelTaxonomy(
        { name: "US| ESPN", groupTitle: "AM | USA ESPN PLUS" },
        "live",
      ),
    ).toMatchObject({
      categoryKey: "sports-events",
      languageKey: "en",
      countryKey: "us",
    });
    expect(
      deriveChannelTaxonomy(
        { name: "UK| BBC 1", groupTitle: "EU | UK GENERAL" },
        "live",
      ),
    ).toMatchObject({ languageKey: "en", countryKey: "uk" });
  });

  it("recognizes multilingual and Arabic provider buckets", () => {
    expect(
      deriveChannelTaxonomy(
        { name: "Example", groupTitle: "[MULTI-LANG] NETFLIX" },
        "series",
      ).languageKey,
    ).toBe("multi");
    expect(
      deriveChannelTaxonomy(
        { name: "AR| Example", groupTitle: "AR | BEIN SPORTS" },
        "live",
      ),
    ).toMatchObject({ languageKey: "ar", categoryKey: "sports-events" });
  });

  it("derives country language independently from the raw category", () => {
    expect(
      deriveChannelTaxonomy(
        { name: "FR| TF1", groupTitle: "EU | FRANCE GENERALE" },
        "live",
      ),
    ).toMatchObject({ languageKey: "fr", countryKey: "fr" });
  });

  it("separates PPV and event-only placeholders from regular live channels", () => {
    expect(
      deriveChannelTaxonomy(
        { name: "S| VIX PPV 99 [EVENT ONLY]", groupTitle: "LATIN SPORTS" },
        "live",
      ),
    ).toMatchObject({
      categoryKey: "ppv-events",
      categoryLabel: "PPV & Event-only",
    });

    expect(
      deriveChannelTaxonomy(
        { name: "VIEW ONLY 14", groupTitle: "Special Events" },
        "live",
      ),
    ).toMatchObject({ categoryKey: "ppv-events" });
  });
});
