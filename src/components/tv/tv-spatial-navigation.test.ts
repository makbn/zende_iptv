import { describe, expect, it } from "vitest";

/**
 * Pure contracts from docs/tv-remote-ux.md — no DOM required.
 * Engine wake/bridge behavior is covered by these selector rules used in
 * explicitDirectionalTarget.
 */

function parseNavSelectors(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

function firstPresentId(
  selectors: string[],
  presentIds: Set<string>,
): string | null {
  for (const selector of selectors) {
    if (!selector.startsWith("#")) continue;
    const id = selector.slice(1);
    if (presentIds.has(id)) return id;
  }
  return null;
}

describe("tv remote UX contracts", () => {
  it("parses comma-separated nav selectors in priority order", () => {
    const selectors = parseNavSelectors(
      "#tv-skip-intro,#tv-player-seekbar,#tv-player-play",
    );
    expect(selectors).toEqual([
      "#tv-skip-intro",
      "#tv-player-seekbar",
      "#tv-player-play",
    ]);
  });

  it("prefers Skip Intro when present, otherwise falls through to Play", () => {
    const selectors = parseNavSelectors(
      "#tv-skip-intro,#tv-player-seekbar,#tv-player-play",
    );
    expect(
      firstPresentId(selectors, new Set(["tv-player-play"])),
    ).toBe("tv-player-play");
    expect(
      firstPresentId(selectors, new Set(["tv-skip-intro", "tv-player-play"])),
    ).toBe("tv-skip-intro");
  });

  it("treats empty nav attributes as no bridge", () => {
    expect(parseNavSelectors(undefined)).toEqual([]);
    expect(parseNavSelectors("")).toEqual([]);
    expect(parseNavSelectors("  ")).toEqual([]);
  });
});
