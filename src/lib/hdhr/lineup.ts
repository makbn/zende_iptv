import "server-only";

import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import { getRequestOrigin } from "@/lib/http/request-origin";
import {
  getHdhrDeviceId,
  getHdhrFirmwareVersion,
  getHdhrMaxChannels,
  getHdhrTunerCount,
} from "@/lib/hdhr/config";

export type HdhrLineupEntry = {
  GuideName: string;
  GuideNumber: string;
  URL: string;
};

export type HdhrDiscover = {
  BaseURL: string;
  DeviceAuth: string;
  DeviceID: string;
  FirmwareName: string;
  FirmwareVersion: string;
  FriendlyName: string;
  LineupURL: string;
  Manufacturer: string;
  ModelNumber: string;
  TunerCount: number;
};

export type HdhrLineupStatus = {
  ScanInProgress: number;
  ScanPossible: number;
  Source: string;
  SourceList: string[];
};

export function buildHdhrDiscover(request: Request, friendlyName: string): HdhrDiscover {
  const origin = getRequestOrigin(request);

  return {
    BaseURL: origin,
    DeviceAuth: "zende",
    DeviceID: getHdhrDeviceId(),
    FirmwareName: `bin_${getHdhrFirmwareVersion()}`,
    FirmwareVersion: getHdhrFirmwareVersion(),
    FriendlyName: friendlyName,
    LineupURL: `${origin}/lineup.json`,
    Manufacturer: "Zenede",
    ModelNumber: getHdhrFirmwareVersion(),
    TunerCount: getHdhrTunerCount(),
  };
}

export function buildHdhrLineupStatus(): HdhrLineupStatus {
  return {
    ScanInProgress: 0,
    ScanPossible: 0,
    Source: "Cable",
    SourceList: ["Cable"],
  };
}

export function streamUrlForGuideNumber(origin: string, guideNumber: string): string {
  return `${origin}/hdhr/stream/${encodeURIComponent(guideNumber)}`;
}

export async function buildHdhrLineup(request: Request): Promise<HdhrLineupEntry[]> {
  const origin = getRequestOrigin(request);
  const { streams } = await getAggregatedXtreamCatalog();
  const max = getHdhrMaxChannels();
  const slice = max != null ? streams.slice(0, max) : streams;

  return slice.map((row) => {
    const guideNumber = String(row.streamId);
    return {
      GuideName: row.channel.name,
      GuideNumber: guideNumber,
      URL: streamUrlForGuideNumber(origin, guideNumber),
    };
  });
}

export function buildHdhrCapabilityXml(request: Request, friendlyName: string): string {
  const origin = getRequestOrigin(request);
  const deviceId = getHdhrDeviceId();
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <URLBase>${esc(origin)}</URLBase>
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>${esc(friendlyName)}</friendlyName>
    <manufacturer>Silicondust</manufacturer>
    <modelName>HDTC-2US</modelName>
    <modelNumber>HDTC-2US</modelNumber>
    <serialNumber></serialNumber>
    <UDN>uuid:${esc(deviceId)}</UDN>
  </device>
</root>`;
}
