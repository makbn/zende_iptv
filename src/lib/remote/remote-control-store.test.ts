import { describe, expect, it } from "vitest";

import {
  enqueueRemoteCommand,
  getRemoteTvSession,
  upsertRemoteTvSession,
} from "@/lib/remote/remote-control-store";

describe("remote control store", () => {
  it("keeps a monotonic command cursor and the latest playback telemetry", () => {
    const userId = `remote-test-${Date.now()}`;
    const session = upsertRemoteTvSession({
      userId,
      label: "Living room TV",
      kind: "tv",
      pathname: "/library",
    });

    const navigate = enqueueRemoteCommand(session.sessionId, userId, {
      type: "navigate",
      payload: { href: "/favorites" },
    });
    const play = enqueueRemoteCommand(session.sessionId, userId, {
      type: "playMedia",
      payload: {
        channel: {
          url: "https://provider.test/live/1.ts",
          name: "Sports One",
          contentType: "live",
          playback: { contentKind: "live" },
        },
      },
    });

    expect(navigate?.seq).toBe(1);
    expect(play?.seq).toBe(2);

    upsertRemoteTvSession({
      userId,
      sessionId: session.sessionId,
      pathname: "/watch?id=opaque",
      playback: {
        playbackId: "stream:opaque",
        active: true,
        title: "Sports One",
        logo: null,
        group: "Sports",
        contentKind: "live",
        currentTime: 0,
        duration: null,
        playing: true,
        buffering: false,
        seekable: false,
      },
    });

    const updated = getRemoteTvSession(session.sessionId, userId);
    expect(updated?.commandSeq).toBe(2);
    expect(updated?.commands.map((command) => command.seq)).toEqual([1, 2]);
    expect(updated?.playback?.title).toBe("Sports One");
    expect(updated?.pathname).toBe("/watch?id=opaque");
  });
});
