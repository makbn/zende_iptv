import { describe, expect, it } from "vitest";

import {
  activeXtreamServerUrl,
  buildXtreamLivePath,
  buildXtreamLiveUrl,
  buildXtreamMoviePath,
  parseXtreamVodIdFromStreamUrl,
  resolveXtreamPlayUrl,
  toXtreamStoragePath,
  toXtreamStorageUrl,
} from "@/lib/iptv/xtream-url";

describe("xtream host-free paths", () => {
  const creds = {
    serverUrl: "http://kfnrinpe.fhkadvnp.com",
    username: "5404759659",
    password: "3125626435",
  };
  const portalHosts = [
    "http://kfnrinpe.fhkadvnp.com",
    "http://kfnrinpe.yufengsmart.com",
  ];

  it("builds and stores movie paths without a host", () => {
    expect(buildXtreamMoviePath(creds, 1393463, "mkv")).toBe(
      "/movie/5404759659/3125626435/1393463.mkv",
    );
    expect(
      toXtreamStorageUrl(
        "http://kfnrinpe.fhkadvnp.com/movie/5404759659/3125626435/1393463.mkv",
        portalHosts,
      ),
    ).toBe("/movie/5404759659/3125626435/1393463.mkv");
  });

  it("keeps a distinct content CDN host instead of inventing the portal host", () => {
    const cdn =
      "http://ex.fhkadvnp.com/movie/5404759659/3125626435/1393463.mkv";
    expect(toXtreamStorageUrl(cdn, portalHosts)).toBe(cdn);
    expect(
      resolveXtreamPlayUrl("http://kfnrinpe.fhkadvnp.com", cdn, portalHosts),
    ).toBe(cdn);
    expect(
      resolveXtreamPlayUrl(
        "http://kfnrinpe.yufengsmart.com",
        cdn,
        portalHosts,
      ),
    ).toBe(cdn);
  });

  it("resolves the active host onto a stored path", () => {
    expect(
      resolveXtreamPlayUrl(
        "http://kfnrinpe.yufengsmart.com",
        "/movie/5404759659/3125626435/1393463.mkv",
        portalHosts,
      ),
    ).toBe(
      "http://kfnrinpe.yufengsmart.com/movie/5404759659/3125626435/1393463.mkv",
    );
  });

  it("rewrites portal absolute URLs onto the active host", () => {
    expect(
      resolveXtreamPlayUrl(
        "http://kfnrinpe.yufengsmart.com",
        "http://kfnrinpe.fhkadvnp.com/movie/5404759659/3125626435/1393463.mkv",
        portalHosts,
      ),
    ).toBe(
      "http://kfnrinpe.yufengsmart.com/movie/5404759659/3125626435/1393463.mkv",
    );
  });

  it("leaves non-Xtream absolute URLs unchanged", () => {
    const external = "https://cdn.example.com/playlist.m3u8";
    expect(toXtreamStoragePath(external)).toBe(external);
    expect(toXtreamStorageUrl(external, portalHosts)).toBe(external);
    expect(resolveXtreamPlayUrl("http://portal.example", external)).toBe(external);
  });

  it("picks backup when toggled", () => {
    expect(
      activeXtreamServerUrl({
        serverUrl: "http://primary.example",
        backupServerUrl: "http://backup.example",
        useBackupServer: true,
      }),
    ).toBe("http://backup.example");
    expect(
      activeXtreamServerUrl({
        serverUrl: "http://primary.example",
        backupServerUrl: "http://backup.example",
        useBackupServer: false,
      }),
    ).toBe("http://primary.example");
  });

  it("still builds absolute live URLs for API callers", () => {
    expect(buildXtreamLiveUrl(creds, 42, "m3u8")).toBe(
      "http://kfnrinpe.fhkadvnp.com/live/5404759659/3125626435/42.m3u8",
    );
    expect(buildXtreamLivePath(creds, 42, "m3u8")).toBe(
      "/live/5404759659/3125626435/42.m3u8",
    );
  });

  it("parses ids from host-free paths", () => {
    expect(parseXtreamVodIdFromStreamUrl("/movie/u/p/1393463.mkv")).toBe("1393463");
  });
});
