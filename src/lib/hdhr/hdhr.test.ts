import { describe, expect, it, vi } from "vitest";

import {
  getHdhrDeviceId,
  getHdhrTunerCount,
  isHdhrEnabled,
} from "@/lib/hdhr/config";
import {
  buildHdhrDiscover,
  buildHdhrLineupStatus,
  streamUrlForGuideNumber,
} from "@/lib/hdhr/lineup";

describe("hdhr config", () => {
  it("defaults tuners to 4", () => {
    vi.stubEnv("ZENDE_HDHR_TUNER_COUNT", "");
    expect(getHdhrTunerCount()).toBe(4);
  });

  it("derives stable 8-char device id", () => {
    vi.stubEnv("AUTH_JWT_SECRET", "test-secret");
    vi.stubEnv("ZENDE_HDHR_DEVICE_ID", "");
    const a = getHdhrDeviceId();
    const b = getHdhrDeviceId();
    expect(a).toMatch(/^[0-9A-F]{8}$/);
    expect(a).toBe(b);
  });

  it("can disable hdhr", () => {
    vi.stubEnv("ZENDE_HDHR_ENABLED", "0");
    expect(isHdhrEnabled()).toBe(false);
  });
});

describe("hdhr discover", () => {
  it("matches Threadfin-style fields", () => {
    vi.stubEnv("AUTH_JWT_SECRET", "plex-test");
    const req = new Request("http://192.168.1.50:8077/discover.json", {
      headers: { host: "192.168.1.50:8077" },
    });
    const d = buildHdhrDiscover(req, "Zenede IPTV");
    expect(d.LineupURL).toBe("http://192.168.1.50:8077/lineup.json");
    expect(d.TunerCount).toBeGreaterThan(0);
    expect(d.DeviceID).toMatch(/^[0-9A-F]{8}$/);
    expect(d.FriendlyName).toBe("Zenede IPTV");
  });

  it("builds stream urls from guide numbers", () => {
    expect(streamUrlForGuideNumber("http://host:8077", "42")).toBe(
      "http://host:8077/hdhr/stream/42",
    );
  });

  it("lineup status reports cable source", () => {
    expect(buildHdhrLineupStatus().Source).toBe("Cable");
  });
});
