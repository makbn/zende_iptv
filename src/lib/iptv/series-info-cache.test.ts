import { describe, expect, it } from "vitest";

import { isProviderInfoFresh, PROVIDER_INFO_TTL_MS } from "@/lib/iptv/series-info-cache";

describe("provider info cache freshness", () => {
  const now = Date.parse("2026-09-23T18:00:00.000Z");

  it("accepts a payload still inside the persisted ttl", () => {
    const cachedAt = new Date(now - PROVIDER_INFO_TTL_MS + 60_000).toISOString();
    expect(isProviderInfoFresh(cachedAt, now)).toBe(true);
  });

  it("rejects a payload after the ttl, even if the file is still on disk", () => {
    const cachedAt = new Date(now - PROVIDER_INFO_TTL_MS - 1_000).toISOString();
    expect(isProviderInfoFresh(cachedAt, now)).toBe(false);
  });

  it("rejects an unreadable timestamp", () => {
    expect(isProviderInfoFresh("not-a-date", now)).toBe(false);
  });
});
