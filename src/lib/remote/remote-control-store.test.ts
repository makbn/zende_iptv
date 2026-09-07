import { describe, expect, it } from "vitest";

import {
  dequeueRemoteCommands,
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

  it("does not replay a route-changing command after a TV page reload", () => {
    const userId = `remote-reload-test-${Date.now()}`;
    const session = upsertRemoteTvSession({
      userId,
      label: "Samsung TV",
      kind: "tv",
      pathname: "/library",
    });

    const navigation = enqueueRemoteCommand(session.sessionId, userId, {
      type: "navigate",
      payload: { href: "/library/movie/42" },
    });
    enqueueRemoteCommand(session.sessionId, userId, {
      type: "play",
    });

    const firstPage = dequeueRemoteCommands(session.sessionId, userId, 0);
    expect(firstPage?.commands.map((command) => command.id)).toEqual([
      navigation?.id,
    ]);

    // A legacy client reloads with cursor zero. The navigation was consumed,
    // while the command queued after it is still delivered to the new page.
    const reloadedPage = dequeueRemoteCommands(session.sessionId, userId, 0);
    expect(reloadedPage?.commands.map((command) => command.type)).toEqual([
      "play",
    ]);
    expect(dequeueRemoteCommands(session.sessionId, userId, 0)?.commands).toEqual([]);
  });

  it("delivers remote subtitle selection and hide commands to the TV", () => {
    const userId = `remote-subtitle-test-${Date.now()}`;
    const session = upsertRemoteTvSession({
      userId,
      label: "Samsung TV",
      kind: "tv",
      pathname: "/watch?id=opaque",
    });

    enqueueRemoteCommand(session.sessionId, userId, {
      type: "subtitleTrack",
      payload: {
        track: {
          id: "subtitle-1",
          label: "English · WEB-DL",
          language: "en",
          vttUrl: "/api/subtitles/vtt/subtitle-1",
        },
      },
    });
    enqueueRemoteCommand(session.sessionId, userId, { type: "subtitleOff" });

    const delivery = dequeueRemoteCommands(session.sessionId, userId, 0);
    expect(delivery?.commands.map((command) => command.type)).toEqual([
      "subtitleTrack",
      "subtitleOff",
    ]);
    expect(delivery?.commands[0]).toMatchObject({
      payload: { track: { vttUrl: "/api/subtitles/vtt/subtitle-1" } },
    });
  });
});
