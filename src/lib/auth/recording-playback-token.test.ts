import { describe, expect, it } from "vitest";

import {
  signRecordingPlaybackToken,
  verifyRecordingPlaybackToken,
} from "./recording-playback-token";

describe("recording-playback-token", () => {
  it("round-trips user + recording id", async () => {
    const t = await signRecordingPlaybackToken({
      userId: "user-1",
      recordingId: "rec-abc",
    });
    const v = await verifyRecordingPlaybackToken(t);
    expect(v).toEqual({ userId: "user-1", recordingId: "rec-abc" });
  });

  it("rejects tampered token", async () => {
    const t = await signRecordingPlaybackToken({
      userId: "user-1",
      recordingId: "rec-abc",
    });
    const tampered = t.slice(0, -4) + "xxxx";
    expect(await verifyRecordingPlaybackToken(tampered)).toBeNull();
  });
});
