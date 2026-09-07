import { describe, expect, it } from "vitest";

import {
  parseRemoteCommandCursor,
  serializeRemoteCommandCursor,
} from "@/lib/remote/remote-command-cursor";

describe("remote command cursor persistence", () => {
  it("restores the acknowledged sequence for the same TV session", () => {
    const stored = serializeRemoteCommandCursor("tv-session", 17);
    expect(parseRemoteCommandCursor(stored, "tv-session")).toBe(17);
  });

  it("does not reuse a cursor for a replacement TV session", () => {
    const stored = serializeRemoteCommandCursor("old-session", 17);
    expect(parseRemoteCommandCursor(stored, "new-session")).toBe(0);
  });

  it("safely ignores corrupt or invalid cursor values", () => {
    expect(parseRemoteCommandCursor("not-json", "tv-session")).toBe(0);
    expect(
      parseRemoteCommandCursor(
        JSON.stringify({ sessionId: "tv-session", seq: -1 }),
        "tv-session",
      ),
    ).toBe(0);
  });
});
